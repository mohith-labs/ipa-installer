document.addEventListener('DOMContentLoaded', () => {
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const progressSection = document.getElementById('progressSection');
  const progressFilename = document.getElementById('progressFilename');
  const progressPercent = document.getElementById('progressPercent');
  const progressBar = document.getElementById('progressBar');
  const progressStatus = document.getElementById('progressStatus');
  const errorMessage = document.getElementById('errorMessage');
  const resultSection = document.getElementById('resultSection');
  const copyBtn = document.getElementById('copyBtn');
  const uploadAnotherBtn = document.getElementById('uploadAnotherBtn');

  // --- Drag and Drop ---

  ['dragenter', 'dragover'].forEach(event => {
    uploadZone.addEventListener(event, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(event => {
    uploadZone.addEventListener(event, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.remove('drag-over');
    });
  });

  uploadZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });

  // --- Click to browse ---

  uploadZone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });

  // --- File handling ---

  function handleFile(file) {
    // Validate extension
    if (!file.name.toLowerCase().endsWith('.ipa')) {
      showError('Please select a valid .ipa file.');
      return;
    }

    // Validate size (500MB)
    if (file.size > 500 * 1024 * 1024) {
      showError('File is too large. Maximum size is 500MB.');
      return;
    }

    uploadFile(file);
  }

  function uploadFile(file) {
    // Reset UI
    hideError();
    resultSection.classList.remove('active');
    uploadZone.style.display = 'none';
    progressSection.classList.add('active');
    progressFilename.textContent = file.name;
    progressPercent.textContent = '0%';
    progressBar.style.width = '0%';
    progressStatus.textContent = 'Uploading...';

    const formData = new FormData();
    formData.append('ipa', file);

    const xhr = new XMLHttpRequest();

    // Progress tracking
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressPercent.textContent = percent + '%';
        progressBar.style.width = percent + '%';

        if (percent === 100) {
          progressStatus.textContent = 'Processing IPA file...';
        }
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.success) {
            showResult(data);
          } else {
            showUploadError(data.error || 'Upload failed');
          }
        } catch (e) {
          showUploadError('Invalid response from server');
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          showUploadError(data.error || `Upload failed (${xhr.status})`);
        } catch (e) {
          showUploadError(`Upload failed (${xhr.status})`);
        }
      }
    });

    xhr.addEventListener('error', () => {
      showUploadError('Network error. Please check your connection and try again.');
    });

    xhr.addEventListener('abort', () => {
      showUploadError('Upload was cancelled.');
    });

    xhr.open('POST', '/api/upload');
    xhr.send(formData);
  }

  // --- Show result ---

  function showResult(data) {
    progressSection.classList.remove('active');
    resultSection.classList.add('active');

    document.getElementById('resultIcon').src = data.iconUrl;
    document.getElementById('resultName').textContent = data.metadata.name;
    document.getElementById('resultVersion').textContent = 'v' + data.metadata.version;
    document.getElementById('resultBuild').textContent = 'Build ' + data.metadata.buildNumber;
    document.getElementById('resultBundleId').textContent = data.metadata.bundleId;
    document.getElementById('resultQR').src = data.qrCode;
    document.getElementById('resultLink').value = data.installUrl;
  }

  // --- Show error ---

  function showUploadError(message) {
    progressSection.classList.remove('active');
    uploadZone.style.display = '';
    showError(message);
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('active');
  }

  function hideError() {
    errorMessage.classList.remove('active');
    errorMessage.textContent = '';
  }

  // --- Copy link ---

  copyBtn.addEventListener('click', () => {
    const link = document.getElementById('resultLink').value;
    navigator.clipboard.writeText(link).then(() => {
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.textContent = 'Copy';
        copyBtn.classList.remove('copied');
      }, 2000);
    }).catch(() => {
      // Fallback: select the input text
      document.getElementById('resultLink').select();
    });
  });

  // --- Upload another ---

  uploadAnotherBtn.addEventListener('click', () => {
    resultSection.classList.remove('active');
    uploadZone.style.display = '';
    fileInput.value = '';
    hideError();
  });
});
