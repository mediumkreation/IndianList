// checkUrls.js Check outdated or invalid urls(cdn_block) 

//import fs from "fs";         // ESM
const fs = require("fs");       // CommonJS   
const path = require("path");

const MAX_CONCURRENCY = 10; // adjust as needed
const TEMP_DIR = path.join(process.cwd(), "temp_scan");

// take source file from CLI arg or fallback
const SOURCE_FILE = process.argv[2]  || "./IndianList/cdn_block.txt";

// HTTP Response Status Code
/*
400 : Bad Request
401 : Unauthorised
402 : Payment Required
403 : Forbidden
404 : Not Found
405 : Method not Allowed
502 : Bad Gateway
*/



function normalizeUrl(entry) {
  let url = entry.trim();

  if (!url || url.startsWith("#")) return null;

  if (url.startsWith("||")) {
    url = "https://" + url.slice(2);
  }

  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  return url;
}

async function checkUrl(url, failures) {
  try {
    const res = await fetch(url, { method: "HEAD" });

    if (res.ok) {
      console.log(`✅ OK: ${url} (status ${res.status})`);
    } else {
      console.log(`⚠️ Failed: ${url} (status ${res.status})`);

      if (!failures[res.status]) failures[res.status] = [];
      failures[res.status].push(url);
    }
  } catch (err) {
    console.log(`❌ Error: ${url} (${err.message})`);
    if (!failures.error) failures.error = [];
    failures.error.push({ url, error: err.message });
  }
}

async function runScan() {
  // ensure temp folder exists
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // copy source file into temp folder
  const tempSourceFile = path.join(TEMP_DIR, "urls-temp.txt");
  fs.copyFileSync(SOURCE_FILE, tempSourceFile);

  // read copied file
  const fileContent = fs.readFileSync(tempSourceFile, "utf-8");
  const urls = fileContent
    .split("\n")
    .map(normalizeUrl)
    .filter(Boolean);

  const failures = {};
  let index = 0;

  async function worker() {
    while (index < urls.length) {
      const url = urls[index++];
      await checkUrl(url, failures);
    }
  }

  const workers = Array.from({ length: MAX_CONCURRENCY }, worker);
  await Promise.all(workers);

  // write scan result file
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultFile = path.join(TEMP_DIR, `scan-results-${timestamp}.json`);

  const summary = Object.keys(failures).length === 0
    ? { message: "🎉 All URLs passed!" }
    : { failures };

  fs.writeFileSync(resultFile, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`\n===== RESULTS SAVED TO: ${resultFile} =====`);

  // remove 404 + 403 URLs from temp source file
  //const badUrls = new Set([...(failures[404] || []), ...(failures[403] || [])]);
  const badUrls = new Set([...(failures[404] || [])]);

  if (badUrls.size > 0) {
    const cleaned = fileContent
      .split("\n")
      .filter(line => {
        const url = normalizeUrl(line);
        return url && !badUrls.has(url);
      })
      .join("\n");

    fs.writeFileSync(tempSourceFile, cleaned, "utf-8");
    console.log(
      `\nRemoved ${badUrls.size} bad URLs (404/403) from ${tempSourceFile}`
    );
  } else {
    console.log("\nNo 404/403 URLs found. Temp file unchanged.");
  }
}

runScan();
