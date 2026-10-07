document.addEventListener('DOMContentLoaded', () => {
  var loadingState = document.getElementById('loadingState');
  var emptyState = document.getElementById('emptyState');
  var errorMessage = document.getElementById('errorMessage');
  var appsList = document.getElementById('appsList');
  var appsActions = document.getElementById('appsActions');
  var scrollSentinel = document.getElementById('scrollSentinel');
  var scrollLoader = document.getElementById('scrollLoader');
  var listEnd = document.getElementById('listEnd');

  var PAGE_SIZE = 20;
  var offset = 0;
  var hasMore = true;
  var isLoading = false;
  var loadedAny = false;
  var seenIds = Object.create(null);
  var observer = null;

  loadNextPage();

  function loadNextPage() {
    if (isLoading || !hasMore) return;
    isLoading = true;

    if (loadedAny) {
      scrollLoader.style.display = '';
    }

    var url = '/api/apps?limit=' + PAGE_SIZE + '&offset=' + offset;

    fetch(url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        if (!data.success || !data.apps) {
          throw new Error('Malformed response');
        }

        scrollLoader.style.display = 'none';

        if (!loadedAny && data.apps.length === 0) {
          showEmpty();
          hasMore = false;
          return;
        }

        if (!loadedAny) {
          loadingState.style.display = 'none';
          appsList.style.display = '';
          appsActions.style.display = '';
          loadedAny = true;
        }

        appendApps(data.apps);

        // Trust the server's pagination block, but fall back to a
        // page-size heuristic if an older server omits it.
        var pagination = data.pagination;
        if (pagination) {
          hasMore = !!pagination.hasMore;
          offset =
            pagination.nextOffset !== null &&
            pagination.nextOffset !== undefined
              ? pagination.nextOffset
              : offset + data.apps.length;
        } else {
          hasMore = data.apps.length === PAGE_SIZE;
          offset += data.apps.length;
        }

        // A page that returned nothing means we've hit the end — stop,
        // otherwise the observer would spin on the same offset forever.
        if (data.apps.length === 0) {
          hasMore = false;
        }

        isLoading = false;

        if (!hasMore) {
          teardownObserver();
          if (listEnd) {
            listEnd.style.display = '';
          }
          return;
        }

        setupObserver();
        // If the freshly appended page did not make the page scrollable,
        // the sentinel is still on screen and no new intersection event
        // fires — pull the next page immediately.
        maybeFillViewport();
      })
      .catch(function () {
        isLoading = false;
        scrollLoader.style.display = 'none';
        if (!loadedAny) {
          showError('Failed to load apps. Please try again.');
        } else {
          showRetry();
        }
      });
  }

  function appendApps(apps) {
    var fragment = document.createDocumentFragment();

    for (var i = 0; i < apps.length; i++) {
      var app = apps[i];

      // Guard against duplicates if an upload shifts between page requests.
      if (app.id) {
        if (seenIds[app.id]) continue;
        seenIds[app.id] = true;
      }

      fragment.appendChild(buildCard(app));
    }

    appsList.appendChild(fragment);
  }

  function buildCard(app) {
    var card = document.createElement('a');
    card.className = 'app-list-card';
    card.href = '/app/' + app.id;

    var sizeMB = '';
    if (app.fileSize) {
      sizeMB = (app.fileSize / (1024 * 1024)).toFixed(1) + ' MB';
    }

    var uploadDate = '';
    if (app.uploadedAt) {
      var d = new Date(app.uploadedAt);
      uploadDate = d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    card.innerHTML =
      '<img class="app-list-icon" src="' + escapeAttr(app.iconUrl) + '" alt="App Icon" loading="lazy" onerror="this.src=\'/images/default-icon.png\'">' +
      '<div class="app-list-details">' +
        '<div class="app-list-name">' + escapeHtml(app.name) + '</div>' +
        '<div class="app-list-meta">' +
          '<span>v' + escapeHtml(app.version) + '</span>' +
          (app.buildNumber ? '<span>Build ' + escapeHtml(app.buildNumber) + '</span>' : '') +
          (sizeMB ? '<span>' + sizeMB + '</span>' : '') +
        '</div>' +
        '<div class="app-list-bundle">' + escapeHtml(app.bundleId) + '</div>' +
        (uploadDate ? '<div class="app-list-date">' + uploadDate + '</div>' : '') +
      '</div>' +
      '<div class="app-list-arrow">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="9 18 15 12 9 6"/>' +
        '</svg>' +
      '</div>';

    return card;
  }

  function setupObserver() {
    if (observer || !scrollSentinel) return;

    // No IntersectionObserver (older Safari) — fall back to a scroll listener.
    if (typeof IntersectionObserver === 'undefined') {
      window.addEventListener('scroll', onScrollFallback, { passive: true });
      window.addEventListener('resize', onScrollFallback, { passive: true });
      observer = 'fallback';
      return;
    }

    observer = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            loadNextPage();
            break;
          }
        }
      },
      // Start fetching before the sentinel is actually visible so the
      // next page is usually already in place by the time it scrolls in.
      { rootMargin: '400px 0px' },
    );

    observer.observe(scrollSentinel);
  }

  function teardownObserver() {
    if (!observer) return;
    if (observer === 'fallback') {
      window.removeEventListener('scroll', onScrollFallback);
      window.removeEventListener('resize', onScrollFallback);
    } else {
      observer.disconnect();
    }
    observer = null;
  }

  function onScrollFallback() {
    if (isLoading || !hasMore) return;
    var rect = scrollSentinel.getBoundingClientRect();
    if (rect.top - window.innerHeight < 400) {
      loadNextPage();
    }
  }

  function maybeFillViewport() {
    if (!hasMore || isLoading || !scrollSentinel) return;
    var rect = scrollSentinel.getBoundingClientRect();
    if (rect.top <= window.innerHeight) {
      loadNextPage();
    }
  }

  function showRetry() {
    scrollLoader.style.display = 'none';
    var retry = document.createElement('button');
    retry.className = 'btn btn-secondary scroll-retry';
    retry.textContent = 'Load more';
    retry.addEventListener('click', function () {
      retry.remove();
      loadNextPage();
    });
    appsList.parentNode.insertBefore(retry, scrollSentinel);
  }

  function showEmpty() {
    loadingState.style.display = 'none';
    emptyState.style.display = '';
  }

  function showError(message) {
    loadingState.style.display = 'none';
    errorMessage.textContent = message;
    errorMessage.classList.add('active');
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
});
