const fs = require('fs');
const https = require('https');

const validatorsPath = require('path').join(__dirname, '..', 'validators.json');

async function fetchVoteAccounts() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getVoteAccounts',
      params: [
        {
          commitment: 'finalized',
        },
      ],
    });

    const options = {
      hostname: 'api.mainnet-beta.solana.com',
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          const voteAccounts = [
            ...(response.result?.current || []),
            ...(response.result?.delinquent || []),
          ];
          resolve(voteAccounts);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function updateValidatorsWithVoteAccounts() {
  try {
    // Read validators.json
    const validatorsData = JSON.parse(fs.readFileSync(validatorsPath, 'utf-8'));

    // Fetch vote accounts
    console.log('Fetching vote accounts from Solana API...');
    const voteAccounts = await fetchVoteAccounts();
    console.log(`Found ${voteAccounts.length} vote accounts`);

    // Create a map of nodePubkey -> votePubkey for quick lookup
    const voteAccountMap = new Map();
    voteAccounts.forEach((account) => {
      voteAccountMap.set(account.nodePubkey, account.votePubkey);
    });

    // Update validators with vote account addresses and remove name field
    let matchedCount = 0;
    validatorsData.validators.forEach((validator) => {
      // Support both publicKey and identityKey for backward compatibility
      const identityKey = validator.identityKey || validator.publicKey;
      const voteAccount = voteAccountMap.get(identityKey);
      if (voteAccount) {
        validator.voteAccount = voteAccount;
        matchedCount++;
      } else {
        const displayName =
          validator.displayName || validator.name || identityKey;
        console.warn(
          `No vote account found for identity: ${identityKey} (${displayName})`
        );
      }

      // Remove name field, keep only displayName
      // If displayName doesn't exist but name does, use name as displayName
      if (validator.name && !validator.displayName) {
        validator.displayName = validator.name;
      }
      delete validator.name;

      // Rename publicKey to identityKey if it exists
      if (validator.publicKey && !validator.identityKey) {
        validator.identityKey = validator.publicKey;
        delete validator.publicKey;
      }
    });

    console.log(
      `Matched ${matchedCount} out of ${validatorsData.validators.length} validators`
    );

    // Write updated validators.json
    fs.writeFileSync(
      validatorsPath,
      JSON.stringify(validatorsData, null, 4),
      'utf-8'
    );

    console.log('Successfully updated validators.json');
  } catch (error) {
    console.error('Error updating validators:', error);
    process.exit(1);
  }
}

updateValidatorsWithVoteAccounts();
