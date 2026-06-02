const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5001}`;

async function main() {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status} ${body}`);
  }

  console.log(body);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});