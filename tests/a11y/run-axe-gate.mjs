import { spawnSync } from "node:child_process";
import process from "node:process";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:4173/app.html";
const axeRun = spawnSync(
  "npx",
  ["--yes", "@axe-core/cli", targetUrl, "--tags", "wcag2a,wcag2aa", "--stdout"],
  { encoding: "utf8" },
);

if (axeRun.error) {
  throw axeRun.error;
}

if (axeRun.status !== 0) {
  process.stderr.write(axeRun.stderr ?? "");
  process.stderr.write(axeRun.stdout ?? "");
  process.exit(axeRun.status ?? 1);
}

const rawOutput = `${axeRun.stdout ?? ""}${axeRun.stderr ?? ""}`;
const jsonStart = rawOutput.indexOf("[");
const jsonEnd = rawOutput.lastIndexOf("]");

if (jsonStart === -1 || jsonEnd === -1 || jsonStart > jsonEnd) {
  process.stderr.write(rawOutput);
  throw new Error("Unable to parse axe-core output.");
}

const results = JSON.parse(rawOutput.slice(jsonStart, jsonEnd + 1));
const blockingImpacts = new Set(["serious", "critical"]);
const blockingViolations = results.flatMap((result) =>
  (result.violations ?? []).filter((violation) => blockingImpacts.has(violation.impact)),
);

if (blockingViolations.length > 0) {
  process.stderr.write(
    `Found ${blockingViolations.length} serious/critical WCAG 2.1 AA violations:\n`,
  );
  for (const violation of blockingViolations) {
    const impactedNodes = violation.nodes?.length ?? 0;
    process.stderr.write(
      `- [${violation.impact}] ${violation.id}: ${violation.help} (nodes: ${impactedNodes})\n`,
    );
  }
  process.exit(1);
}

process.stdout.write("No serious/critical WCAG 2.1 AA violations found.\n");
