// Ports and addresses the test harness uses. Change them with environment variables if they clash.
export const ANVIL_PORT = Number(process.env.E2E_ANVIL_PORT || 8546);
export const LIVE_PORT = Number(process.env.E2E_LIVE_PORT || 4610);
export const PREVIEW_PORT = Number(process.env.E2E_PREVIEW_PORT || 4611);
export const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
export const LIVE_URL = `http://127.0.0.1:${LIVE_PORT}`;
export const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}`;
export const CHAIN_ID = 31337;
export const HEADERS_PORT = Number(process.env.E2E_HEADERS_PORT || 4612);
