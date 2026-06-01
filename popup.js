import { LMSApi } from './lms-api.js';

document.addEventListener('DOMContentLoaded', () => {
  const setupContainer = document.getElementById('setup-container');
  const setupMsg = document.getElementById('setup-msg');
  const openOptionsBtn = document.getElementById('openOptions');
  
  const appContainer = document.getElementById('app-container');
  const playerSelect = document.getElementById('player-select');
  const trackTitleEl = document.getElementById('track-title');
  const trackArtistEl = document.getElementById('track-artist');
  
  const btnPrev = document.getElementById('btn-prev');
  const btnPlayPause = document.getElementById('btn-playpause');
  const btnNext = document.getElementById('btn-next');
  const btnFavorite = document.getElementById('btn-favorite');
  const btnOpenLms = document.getElementById('btn-open-lms');
  
  // Browser UI elements
  const tabFavorites = document.getElementById('tab-favorites');
  const tabApps = document.getElementById('tab-apps');
  const tabLibrary = document.getElementById('tab-library');
  const tabQueue = document.getElementById('tab-queue');
  const btnBrowserBack = document.getElementById('btn-browser-back');
  const btnBrowserRefresh = document.getElementById('btn-browser-refresh');
  const browserTitle = document.getElementById('browser-title');
  const browserList = document.getElementById('browser-list');
  
  const statusMsg = document.getElementById('status-msg');

  let api = null;
  let activePlayerId = null;
  let pollInterval = null;
  let playersPollInterval = null;

  // Browser state
  let currentTab = 'queue'; // 'queue', 'apps', 'library', or 'favorites'
  // Navigation stack. Each entry: { title: '...', command: ['...'] }
  let navStack = [];
  
  let currentTrack = null;
  let isFavorite = false;
  let lastKnownPlaylistIndex = null;
  
  // Custom App
  let customAppCmd = null;
  let customAppTitle = 'App';

  // ========================================== //
  // 1. Initialization & Configuration          //
  // ========================================== //

  // Load server URL and last active player from storage
  chrome.storage.local.get(['lmsServerUrl', 'lmsLastPlayerId', 'lmsAppTabId', 'lmsAppTabName'], async (result) => {
    
    // Configure Custom App Tab
    if (result.lmsAppTabId) {
      customAppCmd = result.lmsAppTabId;
      customAppTitle = result.lmsAppTabName || 'App';
      tabApps.textContent = customAppTitle;
      tabApps.title = `Browse ${customAppTitle}`;
      tabApps.style.display = 'block';
    } else {
      tabApps.style.display = 'none';
    }

    if (result.lmsServerUrl) {
      api = new LMSApi(result.lmsServerUrl);
      
      if (result.lmsLastPlayerId) {
        activePlayerId = result.lmsLastPlayerId;
      }
      
      const success = await fetchPlayers();
      
      if (success) {
        setupContainer.style.display = 'none';
        appContainer.style.display = 'block';
        
        btnOpenLms.style.display = 'block';
        btnOpenLms.addEventListener('click', () => {
          let url = result.lmsServerUrl.replace(/\/$/, '');
          chrome.tabs.create({ url: url });
        });
        
        startPolling();
        if(activePlayerId) loadBrowserRoot();
      } else {
        setupMsg.textContent = 'Error connecting to LMS Server. Please check your connection and settings.';
        openOptionsBtn.style.display = 'block';
      }
      
    } else {
      setupMsg.textContent = 'Welcome to LMS Controller. Please configure your server to get started.';
      openOptionsBtn.style.display = 'block';
    }
  });

  openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // ========================================== //
  // 2. Player Management & State Polling       //
  // ========================================== //

  /**
   * Fetches the list of connected players from the LMS server
   * and populates the player selection dropdown.
   */
  async function fetchPlayers(silent = false) {
    try {
      if (!silent) statusMsg.textContent = 'Fetching players...';
      const result = await api.request('-', ['serverstatus', 0, 100]);
      if (!silent) statusMsg.textContent = '';

      if (result && result.players_loop) {
        // Build new HTML string to compare against current
        let newHtml = '';
        let foundActive = false;
        
        // Filter out disconnected players
        const connectedPlayers = result.players_loop.filter(p => p.connected === 1);

        connectedPlayers.forEach(player => {
          const isSelected = activePlayerId === player.playerid;
          newHtml += `<option value="${player.playerid}"${isSelected ? ' selected' : ''}>${player.name}</option>`;
          if (isSelected) foundActive = true;
        });

        if (connectedPlayers.length === 0) {
          newHtml = '<option value="">No players found</option>';
          activePlayerId = null;
        } else if (!foundActive) {
          activePlayerId = connectedPlayers[0].playerid;
          // Re-evaluate the newHtml to mark the newly selected first item
          newHtml = '';
          connectedPlayers.forEach(player => {
            const isSelected = activePlayerId === player.playerid;
            newHtml += `<option value="${player.playerid}"${isSelected ? ' selected' : ''}>${player.name}</option>`;
          });
          saveActivePlayer(activePlayerId);
        }
        
        // Only update DOM if changed
        if (playerSelect.innerHTML !== newHtml) {
          playerSelect.innerHTML = newHtml;
        }

        if (activePlayerId) {
          updatePlayerState();
        }
      } else {
        playerSelect.innerHTML = '<option value="">No players found</option>';
      }
      return true;
    } catch (error) {
      if (!silent) statusMsg.textContent = 'Error connecting to LMS.';
      console.error(error);
      return false;
    }
  }

  function saveActivePlayer(playerId) {
    chrome.storage.local.set({ lmsLastPlayerId: playerId });
  }

  playerSelect.addEventListener('change', (e) => {
    activePlayerId = e.target.value;
    if (activePlayerId) {
      saveActivePlayer(activePlayerId);
      updatePlayerState();
      loadBrowserRoot();
    }
  });

  async function updatePlayerState() {
    if (!activePlayerId || !api) return;

    try {
      const result = await api.request(activePlayerId, ['status', '-', 1, 'tags:au']);
      
      if (result) {
        if (result.playlist_loop && result.playlist_loop.length > 0) {
          const track = result.playlist_loop[0];
          currentTrack = track;
          trackTitleEl.textContent = `${result.mode === 'play' ? '▶ ' : (result.mode === 'pause' ? '⏸ ' : '⏹ ')}${track.title || 'Unknown Title'}`;

          const index = result.playlist_cur_index ? parseInt(result.playlist_cur_index) + 1 : 1;
          const total = result.playlist_tracks || 1;
          trackArtistEl.textContent = `${track.artist || 'Unknown Artist'} (${index} of ${total})`;
          
          const currentIndex = result.playlist_cur_index ? parseInt(result.playlist_cur_index) : 0;
          if (currentTab === 'queue' && lastKnownPlaylistIndex !== null && lastKnownPlaylistIndex !== currentIndex) {
             loadBrowserRoot(); // Auto-refresh the queue view if it's open and the song changed
          }
          lastKnownPlaylistIndex = currentIndex;

          // Check if track is a favorite
          try {
            let favUrl = track.url || '';
            if (favUrl) {
              const favResult = await api.request(activePlayerId, ['favorites', 'exists', `url:${favUrl}`]);
              isFavorite = (favResult && favResult.exists == 1);
            } else if (track.id) {
              const favResult = await api.request(activePlayerId, ['favorites', 'exists', `track_id:${track.id}`]);
              isFavorite = (favResult && favResult.exists == 1);
            } else {
              isFavorite = false;
            }
            btnFavorite.innerHTML = isFavorite ? '<i class="ph-fill ph-heart" style="color: red;"></i>' : '<i class="ph ph-heart"></i>';
          } catch (err) {
             console.error('Error checking favorite status:', err);
          }

          let spotifyBtn = document.getElementById('btn-spotify');          if (!spotifyBtn) {
             spotifyBtn = document.createElement('a');
             spotifyBtn.id = 'btn-spotify';
             spotifyBtn.innerHTML = '&#127925; Open Spotify';
             spotifyBtn.style = 'display:inline-block; font-size:10px; color:#1db954; text-decoration:none; margin-top:4px;';
             spotifyBtn.target = '_blank';
             trackArtistEl.parentNode.appendChild(spotifyBtn);
          }
          if (track.url && track.url.startsWith('spotify:')) {
             spotifyBtn.style.display = 'inline-block';
             // Spotty URLs usually look like spotify://track:id or spotify:track:id
             const cleanUrl = track.url.replace('spotify://', 'spotify:');
             const parts = cleanUrl.split(':');
             if (parts.length >= 3) {
                spotifyBtn.href = `https://open.spotify.com/${parts[1]}/${parts[2]}`;
             } else {
                spotifyBtn.href = '#';
             }
          } else {
             spotifyBtn.style.display = 'none';
          }
        } else {
          trackTitleEl.textContent = 'Not Playing';
          trackArtistEl.textContent = '';
          albumArtEl.style.display = 'none';
          const spotifyBtn = document.getElementById('btn-spotify');
          if (spotifyBtn) spotifyBtn.style.display = 'none';
        }

        if (result.mode === 'play') {
          btnPlayPause.innerHTML = '<i class="ph-fill ph-pause"></i>';
          btnPlayPause.title = 'Pause';
        } else {
          btnPlayPause.innerHTML = '<i class="ph-fill ph-play"></i>';
          btnPlayPause.title = 'Play';
        }
      }
    } catch (error) {
      console.error("Error updating player state:", error);
    }
  }

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    if (playersPollInterval) clearInterval(playersPollInterval);
    pollInterval = setInterval(updatePlayerState, 10000);
    playersPollInterval = setInterval(() => fetchPlayers(true), 20000);
  }

  // ========================================== //
  // 3. Transport & Media Controls              //
  // ========================================== //

  // Transport button listeners
  const btnClearQueue = document.createElement('button');
  btnClearQueue.className = 'btn-transport';
  btnClearQueue.title = 'Clear Queue';
  btnClearQueue.innerHTML = '<i class="ph-fill ph-trash"></i>';
  btnClearQueue.style.marginLeft = '10px';
  document.querySelector('.transport-controls').appendChild(btnClearQueue);

  btnClearQueue.addEventListener('click', async () => {
    if (activePlayerId && api) {
      statusMsg.textContent = 'Clearing queue...';
      await api.request(activePlayerId, ['playlist', 'clear']);
      updatePlayerState();
      setTimeout(() => { statusMsg.textContent = ''; }, 2000);
    }
  });

  btnPrev.addEventListener('click', async () => {
    if (activePlayerId && api) {
      await api.request(activePlayerId, ['playlist', 'index', '-1']);
      updatePlayerState();
    }
  });

  btnPlayPause.addEventListener('click', async () => {
    if (activePlayerId && api) {
      await api.request(activePlayerId, ['pause']);
      updatePlayerState();
    }
  });

  btnNext.addEventListener('click', async () => {
    if (activePlayerId && api) {
      await api.request(activePlayerId, ['playlist', 'index', '+1']);
      updatePlayerState();
    }
  });

  btnFavorite.addEventListener('click', async () => {
    if (activePlayerId && api && currentTrack) {
      statusMsg.textContent = isFavorite ? 'Removing from favorites...' : 'Adding to favorites...';
      try {
        if (isFavorite) {
          // To remove, we need its hierarchical ID.
          // First, let's try just deleting by URL. If not, fallback to fetching all.
          let favUrl = currentTrack.url;
          let idToRemove = null;
          
          if (favUrl) {
            const favResult = await api.request(activePlayerId, ['favorites', 'items', 0, 999]);
            if (favResult && favResult.loop_loop) {
              const item = favResult.loop_loop.find(f => f.url === favUrl);
              if (item && item.id) idToRemove = item.id;
            }
          }
          if (idToRemove) {
             await api.request(activePlayerId, ['favorites', 'delete', `item_id:${idToRemove}`]);
          } else {
             // Try deleting by URL directly just in case the API supports it undocumented
             await api.request(activePlayerId, ['favorites', 'delete', `url:${favUrl}`]);
          }
        } else {
          // Add
          const title = currentTrack.title || 'Unknown Title';
          const favUrl = currentTrack.url;
          
          let success = false;
          
          // 1. Try to add to local LMS favorites explicitly (what the standard UI tries)
          if (favUrl) {
            try {
              let titleParam = `title:${title}`;
              if (currentTrack.artist && currentTrack.album) {
                 titleParam = `title:${title} by ${currentTrack.artist} from ${currentTrack.album}`;
              } else if (currentTrack.artist) {
                 titleParam = `title:${title} by ${currentTrack.artist}`;
              }
              // The trailing tags parameter is used by the Material UI to force a specific formatting
              await api.request(activePlayerId, ['favorites', 'add', `url:${favUrl}`, titleParam, "tags:aAbcCKWdegGiJkKloPqrRStTuEyY4"]);
              success = true;
            } catch(e) {
              console.warn('Failed to add to LMS local favorites by official URL syntax...', e);
              try {
                // Some plugins hate the title parameter and tags parameter, so let's try just the URL
                await api.request(activePlayerId, ['favorites', 'add', `url:${favUrl}`]);
                success = true;
              } catch(e2) {
                console.warn('Failed to add to LMS local favorites by raw URL...', e2);
              }
            }
          }
          
          if (!success && currentTrack.id) {
            try {
              await api.request(activePlayerId, ['favorites', 'add', `item_id:${currentTrack.id}`]);
              success = true;
            } catch(e) {
              console.warn('Failed to add to LMS local favorites by item_id...', e);
            }
          }
          
          // 2. Always trigger the plugin's native favorite handler (e.g. syncs Spotty tracks to Spotify)
          try {
             await api.request(activePlayerId, ['button', 'favorite']);
             success = true; // If either local LMS or plugin favoriting works, we consider it a success
          } catch(e) {
             console.warn('Failed to trigger plugin native favorite button...', e);
          }
          
          if (!success) {
            throw new Error("All methods failed to save favorite");
          }
        }
        await updatePlayerState();
        setTimeout(() => { statusMsg.textContent = ''; }, 2000);
      } catch (err) {
         console.error('Error toggling favorite:', err);
         statusMsg.textContent = 'Error updating favorite.';
      }
    }
  });

  // ========================================== //
  // 4. Browser Logic (Library, Queue, Apps)    //
  // ========================================== //

  tabFavorites.addEventListener('click', () => {
    if (currentTab === 'favorites') return;
    currentTab = 'favorites';
    tabFavorites.classList.add('active');
    tabApps.classList.remove('active');
    if(tabLibrary) tabLibrary.classList.remove('active');
    if(tabQueue) tabQueue.classList.remove('active');
    loadBrowserRoot();
  });

  tabApps.addEventListener('click', () => {
    if (currentTab === 'apps') return;
    currentTab = 'apps';
    tabApps.classList.add('active');
    tabFavorites.classList.remove('active');
    if(tabLibrary) tabLibrary.classList.remove('active');
    if(tabQueue) tabQueue.classList.remove('active');
    loadBrowserRoot();
  });
  
  if(tabLibrary) {
    tabLibrary.addEventListener('click', () => {
      if (currentTab === 'library') return;
      currentTab = 'library';
      tabLibrary.classList.add('active');
      tabFavorites.classList.remove('active');
      tabApps.classList.remove('active');
      if(tabQueue) tabQueue.classList.remove('active');
      loadBrowserRoot();
    });
  }

  if(tabQueue) {
    tabQueue.addEventListener('click', () => {
      if (currentTab === 'queue') return;
      currentTab = 'queue';
      tabQueue.classList.add('active');
      tabFavorites.classList.remove('active');
      tabApps.classList.remove('active');
      if(tabLibrary) tabLibrary.classList.remove('active');
      loadBrowserRoot();
    });
  }

  if (btnBrowserRefresh) {
    btnBrowserRefresh.addEventListener('click', () => {
      if (currentTab === 'queue') {
         loadBrowserRoot();
      }
    });
  }

  btnBrowserBack.addEventListener('click', () => {
    if (navStack.length > 1) {
      navStack.pop(); // Remove current
      const prev = navStack[navStack.length - 1]; // Get previous
      fetchBrowserItems(prev.title, prev.command);
    }
  });

  function loadBrowserRoot() {
    navStack = []; // Reset stack
    let title, command;


    if (currentTab === 'favorites') {
      title = 'Favorites';
      command = ['favorites', 'items', 0, 100]; 
      if (btnBrowserRefresh) btnBrowserRefresh.style.display = 'none';
    } else if (currentTab === 'apps' && customAppCmd) {
      title = customAppTitle;
      // Most LMS apps respond to their cmd name as a menu id as well
      command = [customAppCmd, 'items', 0, 100, `menu:${customAppCmd}`];
      if (btnBrowserRefresh) btnBrowserRefresh.style.display = 'none';
    } else if (currentTab === 'queue') {
      title = 'Current Queue';
      command = ['status', 0, 100, 'tags:alu'];
      if (btnBrowserRefresh) btnBrowserRefresh.style.display = 'inline-block';
    } else if (currentTab === 'library') {
      title = 'Library';
      if (btnBrowserRefresh) btnBrowserRefresh.style.display = 'none';
      // Instead of relying on a fragile menu ID, we inject a static array of standard LMS library queries
      const mockResult = {
        item_loop: [
          { name: "Artists", cmd: "artists", hasitems: 1 },
          { name: "Albums", cmd: "albums", hasitems: 1 },
          { name: "Genres", cmd: "genres", hasitems: 1 },
          { name: "Playlists", cmd: "playlists", hasitems: 1 },
          { name: "Years", cmd: "years", hasitems: 1 },
          { name: "New Music", cmd: "newmusic", hasitems: 1 }
        ]
      };
      
      navStack.push({ title: 'Library', command: 'MOCK_LIBRARY' });
      browserTitle.textContent = 'Library';
      btnBrowserBack.style.display = 'none';
      renderBrowserItems(mockResult);
      return; // Skip normal fetch
    }

    navStack.push({ title, command });
    fetchBrowserItems(title, command);
  }

  async function fetchBrowserItems(title, command) {
    if (!activePlayerId || !api) return;

    browserTitle.textContent = title;
    browserList.innerHTML = '<li class="browser-item"><div class="browser-item-text">Loading...</div></li>';
    btnBrowserBack.style.display = navStack.length > 1 ? 'block' : 'none';

    try {
      const result = await api.request(activePlayerId, command);
      renderBrowserItems(result);
    } catch (error) {
      console.error("Browser error:", error);
      browserList.innerHTML = '<li class="browser-item"><div class="browser-item-text">Error loading items</div></li>';
    }
  }

  function renderBrowserItems(result) {
    browserList.innerHTML = '';
    
    // Determine the array name based on the response
    let items = [];
    if (!result) {
      browserList.innerHTML = '<li class="browser-item"><div class="browser-item-text">No items found</div></li>';
      return;
    }
    
    if (result.item_loop) items = result.item_loop;
    else if (result.playlist_loop) items = result.playlist_loop;
    else if (result.loop_loop) items = result.loop_loop;
    else if (result.apps_loop) items = result.apps_loop;
    else if (Array.isArray(result)) items = result;
    else {
       // Search blindly for an array
       for (const key in result) {
          if (Array.isArray(result[key])) {
             items = result[key];
             break;
          }
       }
    }
    
    if (items.length === 0 && result.item_id && result.name) {
        items = [result];
    }

    if (currentTab === 'favorites' && Array.isArray(items)) {
      items = [...items].reverse();
    }

    if (!items || items.length === 0) {
      browserList.innerHTML = '<li class="browser-item"><div class="browser-item-text">No items found</div></li>';
      return;
    }

    items.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'browser-item';
      
      if (currentTab === 'queue' && result.playlist_cur_index !== undefined && index === parseInt(result.playlist_cur_index)) {
         li.style.backgroundColor = '#f0f8ff';
         li.style.borderLeft = '3px solid #007bff';
         li.style.paddingLeft = '7px'; // Compensate for the 3px border
         li.style.fontWeight = 'bold';
      }

      const textDiv = document.createElement('div');
      textDiv.className = 'browser-item-text';
      textDiv.textContent = item.name || item.text || item.title || item.album || item.artist || 'Unknown'; // Ensure title maps too for albums
      textDiv.title = textDiv.textContent; 
      li.appendChild(textDiv);

      const isPlayable = item.type === 'audio' || item.type === 'track' || item.type === 'playlist' || item.goAction === 'play' || item.isaudio === 1 || item.params?.touchToPlay || (item.actions && item.actions.play) || item.url || (item.presetParams && item.presetParams.favorites_url) || (item.id && item.title && !item.album && navStack.length > 0 && navStack[navStack.length-1].command[0] === 'tracks');
      const isFolder = item.hasitems === 1 || item.type === 'link' || item.cmd || item.type === 'redirect' || (item.actions && item.actions.go) || item.type === 'playlist' || (currentTab === 'library' && item.id && !isPlayable && !item.url);
      
      const actionsDiv = document.createElement('div');
      actionsDiv.style.display = 'flex';
      actionsDiv.style.gap = '4px';

      if (currentTab === 'queue') {
        const playQueueBtn = document.createElement('div');
        playQueueBtn.className = 'browser-item-icon action-btn';
        playQueueBtn.innerHTML = '<i class="ph-fill ph-play"></i>';
        playQueueBtn.title = 'Play';
        playQueueBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
             await api.request(activePlayerId, ['playlist', 'index', index]);
             setTimeout(updatePlayerState, 500);
          } catch(err) {
             console.error("Play error:", err);
          }
        });
        actionsDiv.appendChild(playQueueBtn);

        const removeQueueBtn = document.createElement('div');
        removeQueueBtn.className = 'browser-item-icon action-btn';
        removeQueueBtn.innerHTML = '<i class="ph-fill ph-trash"></i>';
        removeQueueBtn.title = 'Remove from Queue';
        removeQueueBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
             await api.request(activePlayerId, ['playlist', 'delete', index]);
             loadBrowserRoot(); // Refresh queue view
             setTimeout(updatePlayerState, 500);
          } catch(err) {
             console.error("Remove error:", err);
          }
        });
        actionsDiv.appendChild(removeQueueBtn);
      } else {
        if (isFolder) {
        textDiv.style.cursor = 'pointer';
        textDiv.style.color = '#007bff';
        textDiv.addEventListener('click', (e) => {
          e.stopPropagation();
          let nextCommand = [];
          
          if (currentTab === 'favorites') {
            const folderId = item.params?.item_id || item.id;
            nextCommand = ['favorites', 'items', 0, 100, `item_id:${folderId}`];
          } else if (currentTab === 'library' && !item.actions && !item.cmd) {
            // Standard Library Drill-down
            const lastCmd = navStack.length > 0 ? navStack[navStack.length-1].command[0] : '';
            if (lastCmd === 'genres') {
                nextCommand = ['artists', 0, 100, `genre_id:${item.id}`, 'tags:a'];
            } else if (lastCmd === 'artists') {
                nextCommand = ['albums', 0, 100, `artist_id:${item.id}`, 'tags:al'];
            } else if (lastCmd === 'years') {
                nextCommand = ['albums', 0, 100, `year:${item.title || item.year || item.text}`, 'tags:al'];
            } else if (lastCmd === 'albums' || lastCmd === 'newmusic') {
                nextCommand = ['tracks', 0, 100, `album_id:${item.id}`, 'tags:actu'];
            } else if (lastCmd === 'playlists') {
                nextCommand = ['playlists', 'tracks', 0, 100, `playlist_id:${item.id}`, 'tags:actu'];
            } else if (item.id) {
                nextCommand = ['menu', 0, 100, `item_id:${item.id}`];
            }
          } else {
            if (item.actions && item.actions.go && item.actions.go.cmd) {
               const paramsArgs = Object.entries(item.actions.go.params || {}).map(([k, v]) => `${k}:${v}`);
               nextCommand = [...item.actions.go.cmd, 0, 100];
               if (paramsArgs.length > 0) nextCommand.push(...paramsArgs);
            } else if (item.cmd) {
               // If it's a standard library query like 'albums' or 'artists', we just send that.
               // If it's a plugin cmd, it usually needs 'items'.
               if (['artists', 'albums', 'genres', 'playlists', 'years', 'newmusic'].includes(item.cmd)) {
                 nextCommand = [item.cmd, 0, 100];
               } else {
                 nextCommand = [item.cmd, 'items', 0, 100];
               }
            } else if (item.id) {
               nextCommand = ['menu', 0, 100, `item_id:${item.id}`];
            } else if (item.item_id) {
               nextCommand = ['menu', 0, 100, `item_id:${item.item_id}`];
            } else {
               const fallbackId = item.params?.item_id;
               if (fallbackId && customAppCmd) {
                 nextCommand = [customAppCmd, 'items', 0, 100, `item_id:${fallbackId}`];
               } else {
                 nextCommand = [(item.name || item.text || '').toLowerCase().replace(/\s+/g, ''), 'items', 0, 100];
               }
            }
          }
          
          const newEntry = { title: item.text || item.name || item.title || item.album || item.artist || 'Folder', command: nextCommand };
          navStack.push(newEntry);
          fetchBrowserItems(newEntry.title, nextCommand);
        });
      }

      if (isPlayable) {
        const addBtn = document.createElement('div');
        addBtn.className = 'browser-item-icon action-btn';
        addBtn.innerHTML = '<i class="ph-bold ph-plus"></i>'; 
        addBtn.title = 'Add to end of Queue';
        
        addBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            statusMsg.textContent = `Added ${item.name || item.text || item.title} to Queue`;
            
            if (item.actions && item.actions.add && item.actions.add.cmd) {
               const addArgs = Object.entries(item.actions.add.params || {}).map(([k, v]) => `${k}:${v}`);
               const addCmd = [...item.actions.add.cmd];
               if (addArgs.length > 0) addCmd.push(...addArgs);
               await api.request(activePlayerId, addCmd);
            } else if (currentTab === 'library' && item.id) {
               const lastCmd = navStack.length > 0 ? navStack[navStack.length-1].command[0] : '';
               if (lastCmd === 'tracks' || (lastCmd === 'playlists' && navStack[navStack.length-1].command.includes('tracks'))) {
                   await api.request(activePlayerId, ['playlistcontrol', 'cmd:add', `track_id:${item.id}`]);
               } else if (lastCmd === 'albums' || lastCmd === 'newmusic') {
                   await api.request(activePlayerId, ['playlistcontrol', 'cmd:add', `album_id:${item.id}`]);
               } else if (lastCmd === 'genres') {
                   await api.request(activePlayerId, ['playlistcontrol', 'cmd:add', `genre_id:${item.id}`]);
               } else if (lastCmd === 'years') {
                   await api.request(activePlayerId, ['playlistcontrol', 'cmd:add', `year:${item.id}`]);
               } else {
                   await api.request(activePlayerId, ['playlistcontrol', 'cmd:add', `artist_id:${item.id}`]);
               }
            } else if (currentTab === 'favorites' && (item.params?.item_id || item.id)) {
               await api.request(activePlayerId, ['favorites', 'playlist', 'add', `item_id:${item.params?.item_id || item.id}`]);
            } else if (item.presetParams && item.presetParams.favorites_url) {
               await api.request(activePlayerId, ['playlist', 'add', item.presetParams.favorites_url]);
            } else if (item.id && item.type === 'playlist') {
               await api.request(activePlayerId, ['playlistcontrol', 'cmd:add', `item_id:${item.id}`]);
            } else if (item.params && item.params.item_id) {
               await api.request(activePlayerId, ['favorites', 'playlist', 'add', `item_id:${item.params.item_id}`]);
            } else if (item.id) {
               await api.request(activePlayerId, ['playlistcontrol', 'cmd:add', `item_id:${item.id}`]);
            } else if (item.url) {
               await api.request(activePlayerId, ['playlist', 'add', item.url]);
            } else if (item.item_id || item.id) {
               const playId = item.item_id || item.id;
               await api.request(activePlayerId, ['playlistcontrol', 'cmd:add', `menu_id:${playId}`, `item_id:${playId}`]);
            }
            
            setTimeout(updatePlayerState, 500);
            setTimeout(() => { statusMsg.textContent = ''; }, 2000);
          } catch (err) {
            console.error("Add error:", err);
            statusMsg.textContent = "Error adding item.";
          }
        });
        actionsDiv.appendChild(addBtn);

        const playBtn = document.createElement('div');
        playBtn.className = 'browser-item-icon action-btn';
        playBtn.innerHTML = '<i class="ph-fill ph-play"></i>'; 
        playBtn.title = 'Play';
        
        playBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            statusMsg.textContent = `Playing ${item.name || item.text || item.title}...`;
            
            if (item.actions && item.actions.play && item.actions.play.cmd) {
               const playArgs = Object.entries(item.actions.play.params || {}).map(([k, v]) => `${k}:${v}`);
               const playCmd = [...item.actions.play.cmd];
               if (playArgs.length > 0) playCmd.push(...playArgs);
               await api.request(activePlayerId, playCmd);
            } else if (currentTab === 'library' && item.id) {
               const lastCmd = navStack.length > 0 ? navStack[navStack.length-1].command[0] : '';
               if (lastCmd === 'tracks' || (lastCmd === 'playlists' && navStack[navStack.length-1].command.includes('tracks'))) {
                   await api.request(activePlayerId, ['playlistcontrol', 'cmd:load', `track_id:${item.id}`]);
               } else if (lastCmd === 'albums' || lastCmd === 'newmusic') {
                   await api.request(activePlayerId, ['playlistcontrol', 'cmd:load', `album_id:${item.id}`]);
               } else if (lastCmd === 'genres') {
                   await api.request(activePlayerId, ['playlistcontrol', 'cmd:load', `genre_id:${item.id}`]);
               } else if (lastCmd === 'years') {
                   await api.request(activePlayerId, ['playlistcontrol', 'cmd:load', `year:${item.id}`]);
               } else {
                   await api.request(activePlayerId, ['playlistcontrol', 'cmd:load', `artist_id:${item.id}`]);
               }
            } else if (currentTab === 'favorites' && (item.params?.item_id || item.id)) {
               await api.request(activePlayerId, ['favorites', 'playlist', 'play', `item_id:${item.params?.item_id || item.id}`]);
            } else if (item.presetParams && item.presetParams.favorites_url) {
               await api.request(activePlayerId, ['playlist', 'play', item.presetParams.favorites_url]);
            } else if (item.id && item.type === 'playlist') {
               await api.request(activePlayerId, ['playlistcontrol', 'cmd:load', `item_id:${item.id}`]);
            } else if (item.params && item.params.item_id) {
               await api.request(activePlayerId, ['favorites', 'playlist', 'play', `item_id:${item.params.item_id}`]);
            } else if (item.id) {
               await api.request(activePlayerId, ['playlistcontrol', 'cmd:load', `item_id:${item.id}`]);
            } else if (item.url) {
               await api.request(activePlayerId, ['playlist', 'play', item.url]);
            } else if (item.item_id || item.id) {
               const playId = item.item_id || item.id;
               await api.request(activePlayerId, ['playlistcontrol', 'cmd:load', `menu_id:${playId}`, `item_id:${playId}`]);
            }
            
            setTimeout(updatePlayerState, 500);
            setTimeout(() => { statusMsg.textContent = ''; }, 2000);
          } catch (err) {
            console.error("Play error:", err);
            statusMsg.textContent = "Error playing item.";
          }
        });
        actionsDiv.appendChild(playBtn);
      }
      
      if (!isFolder && !isPlayable) {
         const iconDiv = document.createElement('div');
         iconDiv.className = 'browser-item-icon';
         iconDiv.innerHTML = '<i class="ph-bold ph-music-notes"></i>'; 
         actionsDiv.appendChild(iconDiv);
      }
      }

      li.appendChild(actionsDiv);
      browserList.appendChild(li);
    });
  }

  window.addEventListener('unload', () => {
    if (pollInterval) clearInterval(pollInterval);
    if (playersPollInterval) clearInterval(playersPollInterval);
  });
});
