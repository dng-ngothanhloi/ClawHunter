#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  inputFile: path.join(__dirname, '..', 'data', 'seeds', 'nftowner.json'),
  outputDir: path.join(__dirname, '..', 'metadata', 'nftowner'),
  reportFile: path.join(__dirname, '..', 'AIReports', 'NFTOwner_Metadata_Migration.md'),
  baseImageUrl: 'https://api.clawhunters.com/metadata/nftowner',
  dryRun: process.argv.includes('--dry-run')
};

// NFTOwner metadata schema converter
class NFTOwnerMetadataConverter {
  constructor() {
    this.issues = [];
    this.processedCount = 0;
    this.skippedCount = 0;
  }

  /**
   * Convert NFTOwner seed data to EIP-1155 metadata format
   * @param {Object} ownerData - Raw owner data from seeds
   * @param {Object} clawData - Linked claw machine data
   * @returns {Object} EIP-1155 compliant metadata
   */
  convertToMetadata(ownerData, clawData) {
    try {
      // Calculate ownership percentage from valueUSDT (assuming total machine value)
      const ownershipPercentage = Math.floor((ownerData.valueUSDT / clawData.machinePriceUSDT) * 100);
      
      // Generate attributes from claw machine data
      const attributes = [
        {
          trait_type: "Ownership Percentage",
          value: ownershipPercentage,
          display_type: "boost_percentage"
        },
        {
          trait_type: "Machine Location",
          value: clawData.location.split(',')[2]?.trim() || "Unknown"
        },
        {
          trait_type: "Machine Value",
          value: ownerData.valueUSDT,
          display_type: "number"
        },
        {
          trait_type: "Machine Mode",
          value: clawData.mode.charAt(0).toUpperCase() + clawData.mode.slice(1)
        },
        {
          trait_type: "Machine Rarity",
          value: clawData.rarity.charAt(0).toUpperCase() + clawData.rarity.slice(1)
        },
        {
          trait_type: "NFT Claw Address",
          value: ownerData.nftClawAddress
        },
        {
          trait_type: "Started Date",
          value: clawData.startedDate,
          display_type: "date"
        },
        {
          trait_type: "Expired Date",
          value: clawData.expiredDate,
          display_type: "date"
        },
        {
          trait_type: "Machine Vendor",
          value: clawData.vendor
        },
        {
          trait_type: "Acquisition Date",
          value: new Date().toISOString().split('T')[0],
          display_type: "date"
        }
      ];

      return {
        name: `Machine #${ownerData.nftClawTokenId} Ownership Share - ${ownershipPercentage}%`,
        description: `${ownershipPercentage}% ownership stake in Claw Machine #${ownerData.nftClawTokenId} located at ${clawData.location}. Earn proportional rewards from machine operations.`,
        image: `${CONFIG.baseImageUrl}/${ownerData.tokenId}/image.png`,
        machineId: ownerData.nftClawTokenId,
        shareBps: ownershipPercentage * 100, // Convert to basis points
        units: ownershipPercentage * 100,
        stakeEligible: true,
        nftClawAddress: ownerData.nftClawAddress,
        valueUSDT: ownerData.valueUSDT,
        attributes,
        external_url: `https://clawhunters.com/ownership/${ownerData.tokenId}`,
        background_color: "2D5A87"
      };
    } catch (error) {
      this.issues.push({
        type: 'conversion_error',
        tokenId: ownerData.tokenId,
        message: `Failed to convert metadata: ${error.message}`
      });
      return null;
    }
  }

  /**
   * Validate metadata against NFTOwner schema requirements
   * @param {Object} metadata - Generated metadata
   * @param {number} tokenId - Token ID for error reporting
   * @returns {boolean} True if valid
   */
  validateMetadata(metadata, tokenId) {
    const requiredFields = ['name', 'description', 'image', 'machineId', 'shareBps', 'units', 'stakeEligible', 'nftClawAddress', 'valueUSDT', 'attributes'];
    
    for (const field of requiredFields) {
      if (!metadata.hasOwnProperty(field)) {
        this.issues.push({
          type: 'validation_error',
          tokenId,
          message: `Missing required field: ${field}`
        });
        return false;
      }
    }

    // Validate attribute structure
    if (!Array.isArray(metadata.attributes)) {
      this.issues.push({
        type: 'validation_error',
        tokenId,
        message: 'Attributes must be an array'
      });
      return false;
    }

    // Validate NFT Claw address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(metadata.nftClawAddress) && metadata.nftClawAddress !== "0xClawAddressTBD") {
      this.issues.push({
        type: 'validation_warning',
        tokenId,
        message: `Invalid NFT Claw address format: ${metadata.nftClawAddress}`
      });
    }

    return true;
  }

  /**
   * Process all NFTOwner tokens and generate metadata
   * @param {Array} ownerData - Array of owner seed data
   * @param {Array} clawData - Array of claw machine data
   * @returns {Object} Processing results
   */
  processAll(ownerData, clawData) {
    const results = {
      metadata: {},
      index: [],
      summary: {
        total: ownerData.length,
        processed: 0,
        skipped: 0,
        issues: []
      }
    };

    // Create claw data lookup
    const clawLookup = clawData.reduce((acc, claw) => {
      acc[claw.tokenId] = claw;
      return acc;
    }, {});

    for (const owner of ownerData) {
      const linkedClaw = clawLookup[owner.nftClawTokenId];
      
      if (!linkedClaw) {
        this.issues.push({
          type: 'data_error',
          tokenId: owner.tokenId,
          message: `No linked claw machine found for nftClawTokenId: ${owner.nftClawTokenId}`
        });
        results.summary.skipped++;
        continue;
      }

      const metadata = this.convertToMetadata(owner, linkedClaw);
      
      if (!metadata) {
        results.summary.skipped++;
        continue;
      }

      if (this.validateMetadata(metadata, owner.tokenId)) {
        results.metadata[owner.tokenId] = metadata;
        results.index.push({
          tokenId: owner.tokenId,
          name: metadata.name,
          image: metadata.image,
          machineId: metadata.machineId,
          valueUSDT: metadata.valueUSDT
        });
        results.summary.processed++;
      } else {
        results.summary.skipped++;
      }
    }

    results.summary.issues = this.issues;
    return results;
  }
}

/**
 * Generate migration report
 * @param {Object} results - Processing results
 * @returns {string} Markdown report content
 */
function generateMigrationReport(results) {
  const { summary } = results;
  const issues = summary.issues || [];
  const timestamp = new Date().toISOString();

  return `# NFTOwner Metadata Migration Report

**Generated**: ${timestamp}  
**Migration Type**: NFTOwner seed data to EIP-1155 metadata  
**Total Records**: ${summary.total}

---

## 📊 Migration Summary

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total Records** | ${summary.total} | 100% |
| **Successfully Processed** | ${summary.processed} | ${((summary.processed / summary.total) * 100).toFixed(1)}% |
| **Skipped** | ${summary.skipped} | ${((summary.skipped / summary.total) * 100).toFixed(1)}% |
| **Issues Found** | ${issues.length} | - |

### Processing Status
${summary.processed === summary.total ? '✅ **SUCCESS**: All records processed successfully' : 
  summary.processed > 0 ? '⚠️ **PARTIAL**: Some records processed with issues' : 
  '❌ **FAILED**: No records processed successfully'}

---

## 🗂️ Generated Files

### Metadata Files
- **Individual Files**: \`metadata/nftowner/{1..${summary.total}}.json\`
- **Index File**: \`metadata/nftowner/index.json\`
- **Total Size**: ${summary.processed} metadata files + 1 index file

### File Structure
\`\`\`
metadata/nftowner/
├── 1.json          # NFTOwner #1 metadata
├── 2.json          # NFTOwner #2 metadata
├── ...
├── ${summary.total}.json         # NFTOwner #${summary.total} metadata
└── index.json      # Index of all metadata files
\`\`\`

---

## 📋 Metadata Schema Compliance

### Required Fields Validation
${summary.processed > 0 ? '✅ All processed records include required fields:' : '❌ No records processed successfully'}
- \`name\`: Human-readable ownership description
- \`description\`: Detailed ownership stake description  
- \`image\`: NFTOwner image URL
- \`machineId\`: Linked claw machine ID
- \`shareBps\`: Ownership share in basis points
- \`units\`: Number of ownership units
- \`stakeEligible\`: Staking eligibility status
- \`nftClawAddress\`: Linked NFTClaw contract address
- \`valueUSDT\`: Machine value in USDT
- \`attributes\`: Array of traits and characteristics

### Sample Metadata Structure
\`\`\`json
{
  "name": "Machine #1 Ownership Share - 100%",
  "description": "100% ownership stake in Claw Machine #1 located at Floor 5, WinCom Tower, Da Nang city, Viet Nam. Earn proportional rewards from machine operations.",
  "image": "https://api.clawhunters.com/metadata/nftowner/1/image.png",
  "machineId": 1,
  "shareBps": 10000,
  "units": 10000,
  "stakeEligible": true,
  "nftClawAddress": "0xClawAddressTBD",
  "valueUSDT": 3200,
  "attributes": [
    {
      "trait_type": "Ownership Percentage",
      "value": 100,
      "display_type": "boost_percentage"
    },
    {
      "trait_type": "Started Date",
      "value": "2025-09-16",
      "display_type": "date"
    },
    {
      "trait_type": "Expired Date", 
      "value": "2027-12-16",
      "display_type": "date"
    }
  ]
}
\`\`\`

---

## ⚠️ Issues and Warnings

${issues.length === 0 ? '✅ **No issues found** - All records processed successfully' : 
`### Issue Breakdown
| Issue Type | Count | Description |
|------------|-------|-------------|
${[...new Set(issues.map(i => i.type))].map(type => {
  const count = issues.filter(i => i.type === type).length;
  const desc = type === 'conversion_error' ? 'Failed to convert seed data to metadata' :
               type === 'validation_error' ? 'Metadata failed schema validation' :
               type === 'validation_warning' ? 'Non-critical validation warnings' :
               type === 'data_error' ? 'Missing or invalid source data' : 'Unknown issue';
  return `| **${type}** | ${count} | ${desc} |`;
}).join('\n')}

### Detailed Issues
${issues.map((issue, index) => 
`**Issue #${index + 1}**: \`${issue.type}\`
- **Token ID**: ${issue.tokenId}
- **Message**: ${issue.message}
`).join('\n')}`}

---

## 🚀 Next Steps

### Immediate Actions Required
1. **Address Placeholder Update**: Replace \`"0xClawAddressTBD"\` with actual NFTClaw contract address post-deployment
2. **File Upload**: Upload generated metadata files to IPFS or metadata server
3. **API Integration**: Update API endpoints to serve generated metadata
4. **Contract Integration**: Configure NFTOwner contract to use metadata URIs

### Post-Deployment Tasks
1. **Address Linking**: Run address linking service to update NFTClaw addresses
2. **Metadata Validation**: Validate all metadata files against updated schemas
3. **Index Verification**: Verify index.json completeness and accuracy
4. **API Testing**: Test metadata endpoints with generated files

### Rollback Plan
If issues are found with generated metadata:
1. Backup current metadata files
2. Fix issues in seed data or converter logic
3. Re-run migration with \`--dry-run\` first
4. Validate results before overwriting production metadata

---

## 📈 Migration Statistics

### Data Quality Metrics
- **Address Validation**: ${issues.filter(i => i.message.includes('address')).length} address-related issues
- **Schema Compliance**: ${((summary.processed / summary.total) * 100).toFixed(1)}% compliance rate
- **Data Completeness**: ${summary.processed}/${summary.total} complete records

### Performance Metrics  
- **Processing Speed**: ${summary.total} records processed
- **Success Rate**: ${((summary.processed / summary.total) * 100).toFixed(1)}%
- **Error Rate**: ${((summary.skipped / summary.total) * 100).toFixed(1)}%

---

**Migration completed at**: ${timestamp}  
**Report generated by**: NFTOwner Metadata Migration Tool v1.0
`;
}

/**
 * Update task files with acceptance checks
 */
function updateTaskFiles() {
  const m3Updates = {
    file: path.join(__dirname, '..', 'tasks', 'M3_indexer.md'),
    additions: `
## NFTOwner Metadata Migration Acceptance Checks

**Verification Commands**:
\`\`\`bash
# Verify metadata files generated
ls -la metadata/nftowner/*.json | wc -l  # Should be 101 (100 + index)

# Validate metadata schema compliance  
node scripts/validate_metadata.js metadata/nftowner/

# Check index file completeness
jq 'length' metadata/nftowner/index.json  # Should be 100

# Verify address placeholders
grep -r "0xClawAddressTBD" metadata/nftowner/ | wc -l  # Should be 100
\`\`\`

**Acceptance Criteria**:
- [ ] 100 NFTOwner metadata files generated successfully
- [ ] All metadata files validate against NFTOwner schema
- [ ] Index file contains all 100 token references
- [ ] Address placeholders ready for post-deployment update
- [ ] Migration report shows 100% success rate
`
  };

  const m4Updates = {
    file: path.join(__dirname, '..', 'tasks', 'M4_api.md'),
    additions: `
## NFTOwner Metadata API Integration Checks

**API Endpoint Verification**:
\`\`\`bash
# Test NFTOwner metadata endpoint
curl http://localhost:3000/api/nft/owner/1

# Test metadata index endpoint
curl http://localhost:3000/api/nft/owner/index

# Validate metadata response schema
curl http://localhost:3000/api/nft/owner/1 | jq '.name,.description,.image,.attributes'
\`\`\`

**Acceptance Criteria**:
- [ ] NFTOwner metadata endpoints serve generated files
- [ ] API responses validate against NFTOwner schema
- [ ] All 100 NFTOwner metadata files accessible via API
- [ ] Index endpoint returns complete token list
- [ ] Address placeholder handling implemented
`
  };

  return { m3Updates, m4Updates };
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 NFTOwner Metadata Migration Tool');
  console.log(`Mode: ${CONFIG.dryRun ? 'DRY RUN' : 'EXECUTION'}`);
  console.log('');

  try {
    // Load source data
    console.log('📂 Loading source data...');
    const ownerData = JSON.parse(fs.readFileSync(CONFIG.inputFile, 'utf8'));
    const clawData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seeds', 'nftclaw.json'), 'utf8'));
    
    console.log(`   - NFTOwner records: ${ownerData.length}`);
    console.log(`   - NFTClaw records: ${clawData.length}`);

    // Process metadata
    console.log('⚙️  Processing metadata conversion...');
    const converter = new NFTOwnerMetadataConverter();
    const results = converter.processAll(ownerData, clawData);

    // Generate report
    console.log('📊 Generating migration report...');
    results.summary.issues = converter.issues;
    const report = generateMigrationReport(results);

    // Display summary
    console.log('\n📋 MIGRATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Records: ${results.summary.total}`);
    console.log(`Processed: ${results.summary.processed}`);
    console.log(`Skipped: ${results.summary.skipped}`);
    console.log(`Issues: ${results.summary.issues.length}`);
    console.log(`Success Rate: ${((results.summary.processed / results.summary.total) * 100).toFixed(1)}%`);

    if (results.summary.issues.length > 0) {
      console.log('\n⚠️  ISSUES FOUND:');
      results.summary.issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. [${issue.type}] Token ${issue.tokenId}: ${issue.message}`);
      });
    }

    if (CONFIG.dryRun) {
      console.log('\n🔍 DRY RUN COMPLETE');
      console.log('No files written. Run without --dry-run to generate files.');
      return;
    }

    // Create output directory
    console.log('\n📁 Creating output directories...');
    if (!fs.existsSync(CONFIG.outputDir)) {
      fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }
    const reportsDir = path.dirname(CONFIG.reportFile);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Write metadata files
    console.log('💾 Writing metadata files...');
    let filesWritten = 0;
    for (const [tokenId, metadata] of Object.entries(results.metadata)) {
      const filePath = path.join(CONFIG.outputDir, `${tokenId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
      filesWritten++;
    }

    // Write index file
    const indexPath = path.join(CONFIG.outputDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(results.index, null, 2));
    filesWritten++;

    // Write migration report
    fs.writeFileSync(CONFIG.reportFile, report);

    console.log(`✅ Migration complete! ${filesWritten} files written.`);
    console.log(`📊 Report saved to: ${CONFIG.reportFile}`);

    // Update task files
    const taskUpdates = updateTaskFiles();
    console.log('📝 Task file updates prepared (manual application required)');
    console.log(`   - M3 Indexer: Add acceptance checks`);
    console.log(`   - M4 API: Add endpoint verification`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { NFTOwnerMetadataConverter, generateMigrationReport, updateTaskFiles };
