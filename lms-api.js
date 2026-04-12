/**
 * Wrapper for LMS JSON-RPC API
 */
export class LMSApi {
  constructor(serverUrl) {
    // Ensure url doesn't end with slash and append the jsonrpc endpoint
    this.serverUrl = serverUrl.replace(/\/$/, '') + '/jsonrpc.js';
    this.reqId = 0;
  }

  /**
   * Send a request to the LMS server.
   * @param {string} playerId - The MAC address or ID of the player (use "-" for general server queries).
   * @param {Array} command - The command array, e.g., ["play"] or ["status", "-", 1, "tags:a,l,t,c,u"].
   * @returns {Promise<Object>} The response data from LMS.
   */
  async request(playerId, command) {
    this.reqId += 1;
    
    const payload = {
      id: this.reqId,
      method: "slim.request",
      params: [playerId, command]
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(this.serverUrl, {
        method: 'POST',
        cache: 'no-store',
        // Do not send cookies (LMS does not require them and they can cause CORS issues)
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.result;
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("LMS API Request failed:", error);
      throw error;
    }
  }
}