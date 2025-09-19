#!/usr/bin/env tsx

/**
 * Database Seeding Script for Test Environment
 * 
 * Seeds the database with realistic test data for comprehensive API testing
 */

import { SampleDataGenerator } from './sample-revenue-data.js';

async function seedDatabase(): Promise<void> {
  console.log('🌱 SEEDING TEST DATABASE');
  console.log('========================');
  console.log('');

  const generator = new SampleDataGenerator();
  
  try {
    await generator.generateSampleData();
    
    console.log('');
    console.log('✅ Database seeding completed successfully!');
    console.log('');
    console.log('📊 Generated test data:');
    console.log('- 5 revenue epochs with realistic amounts');
    console.log('- 10+ machine revenue records');
    console.log('- 15+ owner share snapshots');
    console.log('- 12+ staking snapshots');
    console.log('- 3 Merkle roots (A, B, G pools)');
    console.log('- 20+ Merkle leaves with proofs');
    console.log('');
    console.log('🎯 Ready for comprehensive API testing!');
    
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    throw error;
  } finally {
    await generator.disconnect();
  }
}

// Execute if run directly
if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

export { seedDatabase };
