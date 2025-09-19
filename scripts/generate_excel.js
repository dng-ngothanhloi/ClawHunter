#!/usr/bin/env node

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Data generation utilities
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(choices) {
  return choices[Math.floor(Math.random() * choices.length)];
}

function randomDate(start, end) {
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return date.toISOString().split('T')[0];
}

// Generate NFTClaw data
function generateNFTClawData() {
  const locations = [
    "Floor 5, WinCom Tower, Da Nang city, Viet Nam",
    "Floor B1, Himitol Tower, Manila, Philippines"
  ];
  
  const modes = ["standard", "premium", "vip"];
  const rarities = ["common", "rare", "epic", "legendary"];
  const vendors = ["CraneMaster Industries", "ArcadePro Solutions", "GameTech Systems", "ClawKing Manufacturing"];
  const models = ["Crane Master Pro 3000", "ArcadePro Elite 5000", "GameTech Supreme 2000", "ClawKing Premium 4000"];
  
  const data = [];
  
  for (let i = 1; i <= 100; i++) {
    const location = i <= 50 ? locations[0] : locations[1];
    const machinePriceUSDT = randomBetween(1500, 5000);
    const startedDate = randomDate(new Date(), new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
    const expiredDate = randomDate(new Date(startedDate), new Date(new Date(startedDate).getTime() + 36 * 30 * 24 * 60 * 60 * 1000));
    
    data.push({
      tokenId: i,
      mode: randomChoice(modes),
      machinePriceUSDT,
      startedDate,
      expiredDate,
      rarity: randomChoice(rarities),
      location,
      vendor: randomChoice(vendors),
      model: randomChoice(models),
      name: `Claw Machine #${i.toString().padStart(3, '0')} - ${location.split(',')[2].trim()}`,
      description: `Premium claw machine located at ${location}. Features advanced mechanics and premium prizes.`,
      imageURL: `https://api.clawhunters.com/metadata/nftclaw/${i}/image.png`
    });
  }
  
  return data;
}

// Generate NFTOwner data
function generateNFTOwnerData(nftClawData) {
  const data = [];
  
  for (let i = 1; i <= 100; i++) {
    const clawData = nftClawData[i - 1];
    
    data.push({
      tokenId: i,
      nftClawTokenId: i,
      nftClawAddress: "0xClawAddressTBD",
      valueUSDT: clawData.machinePriceUSDT,
      imageURL: clawData.imageURL,
      name: `Machine #${i} Ownership Share - ${randomBetween(5, 25)}%`
    });
  }
  
  return data;
}

// Generate NFTHunter data
function generateNFTHunterData() {
  const levels = ["combat", "command", "super"];
  const levelCounts = [60, 30, 10]; // combat=60, command=30, super=10
  
  const data = [];
  let tokenId = 1;
  
  for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
    const level = levels[levelIndex];
    const count = levelCounts[levelIndex];
    
    for (let i = 0; i < count; i++) {
      const resistance = randomBetween(1, 100);
      const mobSpeed = randomBetween(1, 10);
      const strength = randomBetween(1, 100);
      const recovery = randomBetween(1, 100);
      
      data.push({
        tokenId,
        level,
        resistance,
        mobSpeed,
        strength,
        recovery,
        name: `${level.charAt(0).toUpperCase() + level.slice(1)} Hunter #${tokenId.toString().padStart(3, '0')}`,
        description: `A skilled ${level} hunter with specialized abilities and combat expertise.`,
        imageURL: `https://api.clawhunters.com/metadata/nfthunter/${tokenId}/image.png`
      });
      
      tokenId++;
    }
  }
  
  return data;
}

// Generate NFTTicket data
function generateNFTTicketData() {
  // NFTTicket supply specification: 20,000 total across 4 types
  const ticketTypes = [
    { type: "vip", supply: 1000, tokenTypeId: 1 },
    { type: "special", supply: 3000, tokenTypeId: 2 },
    { type: "premium", supply: 6000, tokenTypeId: 3 },
    { type: "standard", supply: 10000, tokenTypeId: 4 }
  ];
  
  const data = [];
  
  // Generate summary mode (4 rows - one per token type)
  ticketTypes.forEach(ticketConfig => {
    const uses = randomBetween(1, 10);
    const expiresAt = randomDate(new Date(), new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
    
    data.push({
      tokenTypeId: ticketConfig.tokenTypeId,
      tokenType: ticketConfig.type,
      supply: ticketConfig.supply,
      ticketType: ticketConfig.type,
      uses,
      expiresAt,
      name: `${ticketConfig.type.charAt(0).toUpperCase() + ticketConfig.type.slice(1)} Play Ticket - ${uses} Uses`,
      description: `${ticketConfig.type.charAt(0).toUpperCase() + ticketConfig.type.slice(1)} play ticket providing ${uses} plays with enhanced features.`,
      imageURL: `https://api.clawhunters.com/metadata/nftticket/${ticketConfig.tokenTypeId}/image.png`,
      attributes: [
        {
          trait_type: "Token Type",
          value: ticketConfig.type.charAt(0).toUpperCase() + ticketConfig.type.slice(1)
        },
        {
          trait_type: "Supply",
          value: ticketConfig.supply,
          display_type: "number"
        },
        {
          trait_type: "Uses",
          value: uses,
          display_type: "number"
        },
        {
          trait_type: "Rarity",
          value: ticketConfig.type === "vip" ? "Legendary" : 
                 ticketConfig.type === "special" ? "Epic" :
                 ticketConfig.type === "premium" ? "Rare" : "Common"
        }
      ]
    });
  });
  
  return data;
}

// Main function
function main() {
  console.log('Generating NFT catalog data...');
  
  // Generate data
  const nftClawData = generateNFTClawData();
  const nftOwnerData = generateNFTOwnerData(nftClawData);
  const nftHunterData = generateNFTHunterData();
  const nftTicketData = generateNFTTicketData();
  
  // Save JSON seed files
  const seedsDir = path.join(__dirname, '..', 'data', 'seeds');
  fs.writeFileSync(path.join(seedsDir, 'nftclaw.json'), JSON.stringify(nftClawData, null, 2));
  fs.writeFileSync(path.join(seedsDir, 'nftowner.json'), JSON.stringify(nftOwnerData, null, 2));
  fs.writeFileSync(path.join(seedsDir, 'nfthunter.json'), JSON.stringify(nftHunterData, null, 2));
  fs.writeFileSync(path.join(seedsDir, 'nftticket.json'), JSON.stringify(nftTicketData, null, 2));
  
  // Create Excel workbook
  const workbook = XLSX.utils.book_new();
  
  // Add sheets
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(nftClawData), 'NFTClaw');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(nftOwnerData), 'NFTOwner');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(nftHunterData), 'NFTHunter');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(nftTicketData), 'NFTTicket');
  
  // Save Excel file
  const excelPath = path.join(__dirname, '..', 'data', 'nft_catalog.xlsx');
  XLSX.writeFile(workbook, excelPath);
  
  console.log(`✅ Generated NFT catalog with:`);
  console.log(`   - NFTClaw: ${nftClawData.length} machines`);
  console.log(`   - NFTOwner: ${nftOwnerData.length} ownership shares`);
  console.log(`   - NFTHunter: ${nftHunterData.length} hunters`);
  console.log(`   - NFTTicket: ${nftTicketData.length} token types (20,000 total supply)`);
  console.log(`📁 Excel file saved to: ${excelPath}`);
  console.log(`📁 JSON seeds saved to: ${seedsDir}`);
  
  // Print distribution summary
  console.log('\n📊 Hunter Level Distribution:');
  const levelCounts = nftHunterData.reduce((acc, hunter) => {
    acc[hunter.level] = (acc[hunter.level] || 0) + 1;
    return acc;
  }, {});
  
  Object.entries(levelCounts).forEach(([level, count]) => {
    console.log(`   - ${level}: ${count} hunters`);
  });
  
  console.log('\n📊 Machine Location Distribution:');
  const locationCounts = nftClawData.reduce((acc, machine) => {
    const location = machine.location.includes('Da Nang') ? 'Da Nang' : 'Manila';
    acc[location] = (acc[location] || 0) + 1;
    return acc;
  }, {});
  
  Object.entries(locationCounts).forEach(([location, count]) => {
    console.log(`   - ${location}: ${count} machines`);
  });
  
  console.log('\n📊 Ticket Type Distribution:');
  nftTicketData.forEach(ticket => {
    console.log(`   - ${ticket.tokenType} (ID: ${ticket.tokenTypeId}): ${ticket.supply} tickets`);
  });
  
  const totalTickets = nftTicketData.reduce((sum, ticket) => sum + ticket.supply, 0);
  console.log(`   - TOTAL: ${totalTickets} tickets across ${nftTicketData.length} token types`);
}

main();
