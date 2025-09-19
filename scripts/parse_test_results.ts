#!/usr/bin/env tsx

/**
 * Test Results Parser for M3 Indexer and M4 REST API
 * 
 * This script parses test outputs and classifies failures for root cause analysis
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface TestFailure {
  file: string;
  testName: string;
  errorMessage: string;
  stack: string[];
  category: string;
  probableCause: string;
  suggestedFix: string;
  owner: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface TestSummary {
  service: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: TestFailure[];
}

interface ParsedResults {
  indexer: TestSummary;
  api: TestSummary;
  tooling: Record<string, string>;
  timestamp: string;
}

class TestResultParser {
  private artifactsDir = 'artifacts/test-logs';

  async parseResults(): Promise<ParsedResults> {
    console.log('📊 STEP 2: PARSING & CLASSIFYING FAILURES');
    console.log('==========================================');

    const results: ParsedResults = {
      indexer: await this.parseServiceResults('indexer'),
      api: await this.parseServiceResults('api'),
      tooling: this.parseToolingVersions(),
      timestamp: new Date().toISOString()
    };

    // Save machine-readable summary
    writeFileSync(
      join(this.artifactsDir, 'summary.json'),
      JSON.stringify(results, null, 2)
    );

    console.log('✅ Test results parsed and classified');
    console.log(`📁 Summary saved to: ${join(this.artifactsDir, 'summary.json')}`);

    return results;
  }

  private async parseServiceResults(service: 'indexer' | 'api'): Promise<TestSummary> {
    console.log(`📋 Parsing ${service} test results...`);

    const outFile = join(this.artifactsDir, `${service}.out.log`);
    const errFile = join(this.artifactsDir, `${service}.err.log`);
    const junitFile = join(this.artifactsDir, `${service}.junit.xml`);

    let rawOutput = '';
    let failures: TestFailure[] = [];

    // Try to read output files
    if (existsSync(outFile)) {
      rawOutput = readFileSync(outFile, 'utf8');
    } else if (existsSync(errFile)) {
      rawOutput = readFileSync(errFile, 'utf8');
    }

    if (rawOutput) {
      failures = this.parseRawOutput(rawOutput, service);
    }

    // Parse JUnit XML if available
    if (existsSync(junitFile)) {
      const junitResults = this.parseJUnitXML(junitFile);
      failures = [...failures, ...junitResults.failures];
    }

    // If no structured output, try to extract from raw text
    if (failures.length === 0 && rawOutput) {
      failures = this.extractFailuresFromText(rawOutput, service);
    }

    const summary: TestSummary = {
      service,
      total: this.extractTotal(rawOutput),
      passed: this.extractPassed(rawOutput),
      failed: failures.length,
      skipped: this.extractSkipped(rawOutput),
      duration: this.extractDuration(rawOutput),
      failures
    };

    console.log(`  📊 ${service}: ${summary.passed}/${summary.total} passed, ${summary.failed} failed`);
    
    return summary;
  }

  private parseRawOutput(output: string, service: string): TestFailure[] {
    const failures: TestFailure[] = [];
    
    // Parse Vitest output format
    const vitestFailures = this.parseVitestOutput(output, service);
    failures.push(...vitestFailures);

    // Parse Jest output format
    const jestFailures = this.parseJestOutput(output, service);
    failures.push(...jestFailures);

    return failures;
  }

  private parseVitestOutput(output: string, service: string): TestFailure[] {
    const failures: TestFailure[] = [];
    
    // Match Vitest failure patterns
    const failureRegex = /FAIL\s+([^\s]+)\s+\(([^)]+)\)\s*\n([\s\S]*?)(?=\n\s*✓|\n\s*×|\n\s*FAIL|$)/g;
    let match;

    while ((match = failureRegex.exec(output)) !== null) {
      const [, testName, file, errorBlock] = match;
      
      const failure = this.classifyFailure({
        file: file.trim(),
        testName: testName.trim(),
        errorMessage: this.extractErrorMessage(errorBlock),
        stack: this.extractStack(errorBlock),
        category: '',
        probableCause: '',
        suggestedFix: '',
        owner: this.assignOwner(file, service),
        priority: 'MEDIUM'
      });

      failures.push(failure);
    }

    return failures;
  }

  private parseJestOutput(output: string, service: string): TestFailure[] {
    const failures: TestFailure[] = [];
    
    // Match Jest failure patterns
    const failureRegex = /FAIL\s+([^\s]+)\s*\n([\s\S]*?)(?=\n\s*✓|\n\s*×|\n\s*FAIL|$)/g;
    let match;

    while ((match = failureRegex.exec(output)) !== null) {
      const [, file, errorBlock] = match;
      
      const failure = this.classifyFailure({
        file: file.trim(),
        testName: this.extractTestName(errorBlock),
        errorMessage: this.extractErrorMessage(errorBlock),
        stack: this.extractStack(errorBlock),
        category: '',
        probableCause: '',
        suggestedFix: '',
        owner: this.assignOwner(file, service),
        priority: 'MEDIUM'
      });

      failures.push(failure);
    }

    return failures;
  }

  private parseJUnitXML(filePath: string): { failures: TestFailure[] } {
    const failures: TestFailure[] = [];
    
    try {
      const content = readFileSync(filePath, 'utf8');
      // Basic JUnit XML parsing (could be enhanced with proper XML parser)
      const testCaseRegex = /<testcase[^>]*name="([^"]*)"[^>]*classname="([^"]*)"[^>]*>[\s\S]*?<\/testcase>/g;
      const failureRegex = /<failure[^>]*>([\s\S]*?)<\/failure>/g;
      
      let match;
      while ((match = testCaseRegex.exec(content)) !== null) {
        const [, testName, className] = match;
        const testCaseContent = match[0];
        
        const failureMatch = failureRegex.exec(testCaseContent);
        if (failureMatch) {
          const errorMessage = failureMatch[1];
          
          const failure = this.classifyFailure({
            file: className,
            testName,
            errorMessage,
            stack: this.extractStack(errorMessage),
            category: '',
            probableCause: '',
            suggestedFix: '',
            owner: this.assignOwner(className, 'unknown'),
            priority: 'MEDIUM'
          });

          failures.push(failure);
        }
      }
    } catch (error) {
      console.warn(`Failed to parse JUnit XML: ${error.message}`);
    }

    return { failures };
  }

  private extractFailuresFromText(output: string, service: string): TestFailure[] {
    const failures: TestFailure[] = [];
    
    // Look for common error patterns
    const errorPatterns = [
      /Error: (.*?)\n/g,
      /FAIL (.*?)\n/g,
      /✗ (.*?)\n/g,
      /AssertionError: (.*?)\n/g
    ];

    for (const pattern of errorPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const errorMessage = match[1];
        
        const failure = this.classifyFailure({
          file: 'unknown',
          testName: 'unknown',
          errorMessage,
          stack: [],
          category: '',
          probableCause: '',
          suggestedFix: '',
          owner: this.assignOwner('unknown', service),
          priority: 'MEDIUM'
        });

        failures.push(failure);
      }
    }

    return failures;
  }

  private classifyFailure(failure: TestFailure): TestFailure {
    const error = failure.errorMessage.toLowerCase();
    
    // DB/Prisma classification
    if (this.matchesPattern(error, [
      'p1010', 'permission denied', 'table.*not found', 'column.*not found',
      'migration', 'prisma', 'database', 'connection refused'
    ])) {
      failure.category = 'DB/Prisma';
      failure.probableCause = 'Database connection or schema issues';
      failure.suggestedFix = 'Check DATABASE_URL, run prisma migrate dev, ensure database permissions';
      failure.priority = 'HIGH';
    }
    // Network/Environment classification
    else if (this.matchesPattern(error, [
      'econnrefused', 'enotfound', 'timeout', 'network', 'provider',
      'chain_id', 'rpc', 'connection'
    ])) {
      failure.category = 'Env/Network';
      failure.probableCause = 'Network connectivity or environment configuration issues';
      failure.suggestedFix = 'Check RPC URL, network connectivity, environment variables';
      failure.priority = 'HIGH';
    }
    // ABI/Event mismatch classification
    else if (this.matchesPattern(error, [
      'event signature', 'decode error', 'interface.getevent', 'abi',
      'function.*not found', 'ethers', 'viem'
    ])) {
      failure.category = 'ABI/Event mismatch';
      failure.probableCause = 'Contract ABI or event signature mismatch';
      failure.suggestedFix = 'Verify contract addresses, update ABIs, check ethers/viem compatibility';
      failure.priority = 'MEDIUM';
    }
    // Decimals & Math classification
    else if (this.matchesPattern(error, [
      'bignumber', 'overflow', 'decimal', 'usdt.*6', 'usdt.*18',
      'floor', 'round', 'precision'
    ])) {
      failure.category = 'Decimals & Math';
      failure.probableCause = 'Decimal precision or mathematical calculation issues';
      failure.suggestedFix = 'Normalize USDT to 6 decimals, verify floor division math';
      failure.priority = 'HIGH';
    }
    // Time/Epoch classification
    else if (this.matchesPattern(error, [
      'timezone', 'asia/ho_chi_minh', 'snapshot', 'epoch', 'date',
      'non-deterministic', 'end-of-day'
    ])) {
      failure.category = 'Time/Epoch';
      failure.probableCause = 'Timezone or epoch timing issues';
      failure.suggestedFix = 'Set TZ=Asia/Ho_Chi_Minh, allow snapshot during tests';
      failure.priority = 'MEDIUM';
    }
    // Merkle Determinism classification
    else if (this.matchesPattern(error, [
      'merkle', 'leaf order', 'encoding', 'root', 'proof',
      'deterministic', 'hash'
    ])) {
      failure.category = 'Merkle Determinism';
      failure.probableCause = 'Merkle tree ordering or encoding issues';
      failure.suggestedFix = 'Enforce deterministic sort, normalize encoding';
      failure.priority = 'HIGH';
    }
    // API Contract Wiring classification
    else if (this.matchesPattern(error, [
      '404', 'endpoint', 'address', 'dto', 'mismatch',
      'contract', 'service'
    ])) {
      failure.category = 'API Contract Wiring';
      failure.probableCause = 'API endpoint or contract address configuration issues';
      failure.suggestedFix = 'Verify contract addresses, check endpoint implementations';
      failure.priority = 'MEDIUM';
    }
    // Ports/Runtime classification
    else if (this.matchesPattern(error, [
      'eaddrinuse', 'port.*busy', 'port.*4000', 'address already in use'
    ])) {
      failure.category = 'Ports/Runtime';
      failure.probableCause = 'Port conflicts or runtime issues';
      failure.suggestedFix = 'Use random ports in tests, ensure proper cleanup';
      failure.priority = 'LOW';
    }
    // Default classification
    else {
      failure.category = 'Unknown';
      failure.probableCause = 'Unclassified error';
      failure.suggestedFix = 'Manual investigation required';
      failure.priority = 'MEDIUM';
    }

    return failure;
  }

  private matchesPattern(text: string, patterns: string[]): boolean {
    return patterns.some(pattern => text.includes(pattern));
  }

  private extractErrorMessage(errorBlock: string): string {
    const lines = errorBlock.split('\n');
    for (const line of lines) {
      if (line.trim() && !line.includes('at ') && !line.includes('Error:')) {
        return line.trim();
      }
    }
    return errorBlock.split('\n')[0]?.trim() || 'Unknown error';
  }

  private extractStack(errorBlock: string): string[] {
    return errorBlock
      .split('\n')
      .filter(line => line.includes('at ') || line.includes('Error:'))
      .slice(0, 10)
      .map(line => line.trim());
  }

  private extractTestName(errorBlock: string): string {
    const lines = errorBlock.split('\n');
    for (const line of lines) {
      if (line.includes('should ') || line.includes('test ') || line.includes('✓') || line.includes('×')) {
        return line.trim().replace(/[✓×]/g, '').trim();
      }
    }
    return 'Unknown test';
  }

  private assignOwner(file: string, service: string): string {
    if (file.includes('indexer') || service === 'indexer') return 'M3 Team';
    if (file.includes('api') || service === 'api') return 'M4 Team';
    return 'DevOps Team';
  }

  private parseToolingVersions(): Record<string, string> {
    const toolingFile = join(this.artifactsDir, 'tooling.txt');
    const versions: Record<string, string> = {};

    if (existsSync(toolingFile)) {
      const content = readFileSync(toolingFile, 'utf8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        if (line.includes(':')) {
          const [tool, version] = line.split(':');
          versions[tool.trim()] = version.trim();
        }
      }
    }

    return versions;
  }

  private extractTotal(output: string): number {
    const match = output.match(/(\d+)\s+passed|\s+(\d+)\s+test/i);
    return match ? parseInt(match[1] || match[2]) : 0;
  }

  private extractPassed(output: string): number {
    const match = output.match(/(\d+)\s+passed/i);
    return match ? parseInt(match[1]) : 0;
  }

  private extractSkipped(output: string): number {
    const match = output.match(/(\d+)\s+skipped/i);
    return match ? parseInt(match[1]) : 0;
  }

  private extractDuration(output: string): number {
    const match = output.match(/(\d+(?:\.\d+)?)\s*(?:ms|s)/i);
    return match ? parseFloat(match[1]) : 0;
  }
}

// Main execution
if (require.main === module) {
  const parser = new TestResultParser();
  parser.parseResults().catch(console.error);
}

export { TestResultParser };
