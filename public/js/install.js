document.addEventListener('DOMContentLoaded', async () => {
  const loadingState = document.getElementById('loadingState');
  const notFoundState = document.getElementById('notFoundState');
  const installCard = document.getElementById('installCard');

  // Extract app ID from URL path: /app/<id>
  const pathParts = window.location.pathname.split('/');
  const appId = pathParts[pathParts.length - 1];

  if (!appId) {
    showNotFound();
    return;
  }

  try {
    const response = await fetch(`/api/app/${appId}`);

    if (!response.ok) {
      showNotFound();
      return;
    }

    const data = await response.json();
    showApp(data);
  } catch (err) {
    showNotFound();
  }

  function showApp(data) {
    loadingState.style.display = 'none';
    installCard.style.display = '';

    // Populate app info
    document.getElementById('appIcon').src = data.iconUrl;
    document.getElementById('appName').textContent = data.metadata.name;
    document.getElementById('appVersion').textContent = 'v' + data.metadata.version + ' (Build ' + data.metadata.buildNumber + ')';
    document.getElementById('appBundleId').textContent = data.metadata.bundleId;

    // File size
    if (data.metadata.fileSize) {
      const sizeMB = (data.metadata.fileSize / (1024 * 1024)).toFixed(1);
      document.getElementById('appFileSize').textContent = sizeMB + ' MB';
    }

    // Set install link
    document.getElementById('installBtn').href = data.itmsLink;

    // Update page title
    document.title = `Install ${data.metadata.name} — Install On Air`;

    // iOS detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (!isIOS) {
      document.getElementById('nonIosWarning').classList.add('active');
    } else if (!isSafari) {
      const warning = document.getElementById('nonIosWarning');
      warning.innerHTML = '<strong>Open in Safari</strong><p style="margin-top: 4px;">OTA app installation only works in Safari. Please copy this link and open it in Safari.</p>';
      warning.classList.add('active');
    }
  }

  function showNotFound() {
    loadingState.style.display = 'none';
    notFoundState.style.display = '';
  }
});
