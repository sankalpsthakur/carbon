#!/usr/bin/env node
/**
 * Validate all 6 testing swarm YAML workflows using swarm.validate
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function rpcCall(proc, method, params) {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };

  const message = JSON.stringify(request);
  const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;

  return new Promise((resolve, reject) => {
    let responseData = '';
    let contentLength = null;
    let headerComplete = false;

    const cleanup = () => {
      proc.stdout.removeAllListeners();
    };

    proc.stdout.on('data', (chunk) => {
      responseData += chunk.toString();

      if (!headerComplete) {
        const headerEnd = responseData.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const headers = responseData.substring(0, headerEnd);
          const match = headers.match(/Content-Length: (\d+)/);
          if (match) {
            contentLength = parseInt(match[1]);
            headerComplete = true;
            responseData = responseData.substring(headerEnd + 4);
          }
        }
      }

      if (headerComplete && Buffer.byteLength(responseData) >= contentLength) {
        const jsonStr = responseData.substring(0, contentLength);
        cleanup();
        try {
          const response = JSON.parse(jsonStr);
          resolve(response.result || response);
        } catch (err) {
          reject(err);
        }
      }
    });

    setTimeout(() => {
      cleanup();
      reject(new Error('Timeout'));
    }, 30000);

    proc.stdin.write(header + message);
  });
}

async function main() {
  const proc = spawn('node', ['swarms/tools/swarm-mcp.js'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  try {
    await rpcCall(proc, 'initialize', { protocolVersion: '2024-11-05', capabilities: {} });
    console.log('✅ Swarm MCP initialized\n');

    const testsDir = 'swarms/workflows/tests';
    const yamlFiles = fs.readdirSync(testsDir).filter(f => f.endsWith('.yaml'));

    console.log(`Found ${yamlFiles.length} testing workflow YAML files:\n`);

    let passCount = 0;
    let failCount = 0;

    for (const filename of yamlFiles) {
      const filepath = path.join(testsDir, filename);
      const yamlContent = fs.readFileSync(filepath, 'utf8');

      const validateResult = await rpcCall(proc, 'tools/call', {
        name: 'swarm.validate',
        arguments: {
          yaml: yamlContent,
        },
      });

      const result = JSON.parse(validateResult.content[0].text);

      if (result.valid) {
        console.log(`✅ ${filename}`);
        console.log(`   Stages: ${result.stage_count}, DAG: ${result.dag_valid ? 'valid' : 'invalid'}`);
        passCount++;
      } else {
        console.log(`❌ ${filename}`);
        console.log(`   Errors: ${JSON.stringify(result.errors)}`);
        failCount++;
      }
    }

    console.log(`\n=== Validation Summary ===`);
    console.log(`Total: ${yamlFiles.length} | Passed: ${passCount} | Failed: ${failCount}`);

    if (failCount === 0) {
      console.log('🎉 All testing swarm YAMLs are valid!');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    proc.kill();
  }
}

main();
