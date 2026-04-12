import { LMSApi } from './lms-api.js';

document.addEventListener('DOMContentLoaded', () => {
  const serverUrlInput = document.getElementById('serverUrl');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');
  
  const appSelect = document.getElementById('appSelect');
  const fetchAppsBtn = document.getElementById('fetchAppsBtn');
  const appStatusDiv = document.getElementById('appStatus');

  let currentAppId = null;

  // ========================================== //
  // 1. Load Existing Configuration             //
  // ========================================== //

  // Load existing configuration
  chrome.storage.local.get(['lmsServerUrl', 'lmsAppTabId', 'lmsAppTabName'], (result) => {
    if (result.lmsServerUrl) {
      serverUrlInput.value = result.lmsServerUrl;
      fetchAppsBtn.disabled = false;
      appSelect.disabled = false;
    }
    
    if (result.lmsAppTabId) {
      currentAppId = result.lmsAppTabId;
      // Pre-fill the select with the current app until we fetch
      const opt = document.createElement('option');
      opt.value = currentAppId;
      opt.textContent = result.lmsAppTabName || currentAppId;
      opt.selected = true;
      appSelect.appendChild(opt);
    }
  });

  // ========================================== //
  // 2. Save Server Configuration & Testing     //
  // ========================================== //

  // Save server configuration
  saveBtn.addEventListener('click', async () => {
    const url = serverUrlInput.value.trim();
    
    // Basic validation
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      statusDiv.style.color = 'red';
      statusDiv.textContent = 'URL must start with http:// or https://';
      return;
    }

    try {
      const urlObj = new URL(url);
      const origin = urlObj.origin + '/*';
      
      const granted = await new Promise(resolve => {
        chrome.permissions.request({
          origins: [origin]
        }, (granted) => resolve(granted));
      });

      if (!granted) {
        statusDiv.style.color = 'red';
        statusDiv.textContent = 'Permission to access the LMS server was denied.';
        return;
      }
    } catch (e) {
      statusDiv.style.color = 'red';
      statusDiv.textContent = 'Invalid URL format.';
      return;
    }

    saveBtn.disabled = true;
    statusDiv.style.color = '#333';
    statusDiv.textContent = 'Testing connection...';

    try {
      const api = new LMSApi(url);
      // Test connection by requesting server status
      await api.request('-', ['serverstatus', 0, 1]);
      
      // If we get here, connection was successful
      chrome.storage.local.set({ lmsServerUrl: url }, () => {
        statusDiv.style.color = 'green';
        statusDiv.textContent = 'Connection successful! Settings saved.';
        saveBtn.disabled = false;
        fetchAppsBtn.disabled = false;
        appSelect.disabled = false;
        setTimeout(() => {
          statusDiv.textContent = '';
        }, 3000);
      });
    } catch (error) {
      statusDiv.style.color = 'red';
      statusDiv.textContent = `Connection failed: ${error.message}. Please check the URL and ensure LMS is running.`;
      saveBtn.disabled = false;
    }
  });

  // ========================================== //
  // 3. Custom App Tab Configuration            //
  // ========================================== //

  // Fetch Apps list from LMS
  fetchAppsBtn.addEventListener('click', async () => {
    const url = serverUrlInput.value.trim();
    if (!url) return;
    
    fetchAppsBtn.disabled = true;
    appSelect.disabled = true;
    appStatusDiv.style.color = '#333';
    appStatusDiv.textContent = 'Fetching apps...';

    try {
      const api = new LMSApi(url);
      
      // Try to get a player ID first, as some apps only list when queried against a player
      let playerId = '-';
      try {
        const serverStatus = await api.request('-', ['serverstatus', 0, 1]);
        if (serverStatus && serverStatus.players_loop && serverStatus.players_loop.length > 0) {
          playerId = serverStatus.players_loop[0].playerid;
        }
      } catch (e) {
        console.warn("Could not get player ID, falling back to '-'", e);
      }

      // 1. Try modern apps/radios endpoint
      // 2. Try the menu endpoint specifically asking for apps/radios
      const [appsResult, radiosResult, menuAppsResult, menuRadiosResult] = await Promise.all([
        api.request(playerId, ['apps', 0, 100]).catch(() => ({})),
        api.request(playerId, ['radios', 0, 100]).catch(() => ({})),
        api.request(playerId, ['menu', 0, 100, 'menu:apps']).catch(() => ({})),
        api.request(playerId, ['menu', 0, 100, 'menu:radios']).catch(() => ({}))
      ]);
      
      let allApps = [];
      const loopKeys = ['app_loop', 'apps_loop', 'appss_loop', 'item_loop', 'loop_loop', 'radios_loop'];
      
      const results = [appsResult, radiosResult, menuAppsResult, menuRadiosResult];
      
      results.forEach(res => {
        if (res) {
          for (const key of loopKeys) {
            if (res[key] && Array.isArray(res[key])) {
              allApps = allApps.concat(res[key]);
            }
          }
        }
      });
      
      console.log("Raw items from server:", allApps);
      console.log("Responses:", { appsResult, radiosResult, menuAppsResult, menuRadiosResult });
      
      // Extract unique apps by command
      const uniqueApps = {};
      allApps.forEach(app => {
        // Find the command to invoke this app
        let cmdKey = null;
        if (app.cmd && app.cmd !== 'apps' && app.cmd !== 'radios') {
          cmdKey = app.cmd;
        } else if (app.actions && app.actions.go && app.actions.go.cmd && app.actions.go.cmd[0]) {
          cmdKey = app.actions.go.cmd[0];
        } else if (app.id) {
          // If it's an ID like 'plugin.spotty' extract 'spotty'
          cmdKey = app.id.startsWith('plugin.') ? app.id.split('.')[1] : app.id;
        }
        
        const name = app.name || app.text || app.title;
        
        // Exclude generic folders or actions that aren't top-level apps
        if (cmdKey && name && typeof cmdKey === 'string' && cmdKey !== 'playlist' && cmdKey !== 'appsgallery') {
          uniqueApps[cmdKey] = name;
        }
      });
      
      // Rebuild the select dropdown
      appSelect.innerHTML = '<option value="">-- None (Hide App Tab) --</option>';
      const appKeys = Object.keys(uniqueApps).sort((a, b) => uniqueApps[a].localeCompare(uniqueApps[b]));
      
      appKeys.forEach(cmd => {
        const opt = document.createElement('option');
        opt.value = cmd;
        opt.textContent = uniqueApps[cmd];
        if (cmd === currentAppId) {
          opt.selected = true;
        }
        appSelect.appendChild(opt);
      });
      
      if (appKeys.length === 0) {
        console.log("No apps found. Server returned for menu:apps ->", appsResult, "and menu:radios ->", radiosResult);
      }
      
      appStatusDiv.style.color = 'green';
      appStatusDiv.textContent = `Found ${appKeys.length} apps. Select one to enable the tab!`;
      fetchAppsBtn.disabled = false;
      appSelect.disabled = false;
      setTimeout(() => { appStatusDiv.textContent = ''; }, 4000);
      
    } catch (error) {
      appStatusDiv.style.color = 'red';
      appStatusDiv.textContent = `Failed to fetch apps: ${error.message}`;
      fetchAppsBtn.disabled = false;
      appSelect.disabled = false;
    }
  });

  // Save App choice immediately on change
  appSelect.addEventListener('change', () => {
    const selectedId = appSelect.value;
    const selectedName = selectedId ? appSelect.options[appSelect.selectedIndex].text : '';
    
    currentAppId = selectedId;
    
    chrome.storage.local.set({ 
      lmsAppTabId: selectedId,
      lmsAppTabName: selectedName
    }, () => {
      appStatusDiv.style.color = 'green';
      appStatusDiv.textContent = selectedId ? `Saved "${selectedName}" as App tab.` : 'App tab disabled.';
      setTimeout(() => { appStatusDiv.textContent = ''; }, 3000);
    });
  });
});
