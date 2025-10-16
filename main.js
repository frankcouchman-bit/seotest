// Initialize Supabase client
const { createClient } = supabase;
const SUPABASE_URL = "https://cmkafqlajemsgxevxfkx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ...Vs";  // truncated for security; use the full anon key here
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Base API URL for our Cloudflare Worker backend
const API_BASE_URL = "https://seoscribe.frank-couchman.workers.dev";

// Authentication state check (for protected pages like dashboard)
(async function() {
  // If on dashboard page, ensure user is logged in
  if (document.body.classList.contains('dashboard-page')) {
    let { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      // Not logged in, redirect to login
      window.location.href = "login.html";
    } else {
      // User is logged in, update UI accordingly
      const userEmail = session.user.email;
      // Optionally, fetch user profile/plan from Supabase if stored
      // For simplicity, assume free plan unless we verify otherwise
      const planBadge = document.getElementById('plan-indicator');
      const upgradeLink = document.getElementById('upgrade-link');
      // If we had stored plan info (e.g., in user metadata or a table), we'd fetch it here.
      // For now, let's assume if the user has a Pro subscription, our backend would have added a custom claim or entry.
      // We can call an endpoint to get plan info, or fetch from Supabase if such data is stored.
      // Placeholder: check a user_metadata flag (if exists)
      try {
        const { data: profile } = await supabaseClient.from('profiles').select('plan').eq('id', session.user.id).single();
        if (profile && profile.plan === 'pro') {
          planBadge.textContent = "Pro Plan";
          planBadge.style.background = "#d1fae5";
          planBadge.style.color = "#065f46";
          upgradeLink.classList.add('hidden');
        } else {
          // Free plan default
          planBadge.textContent = "Free Plan";
          upgradeLink.classList.remove('hidden');
        }
      } catch (error) {
        // If profiles table or plan info not available, default to showing Free plan with upgrade option
        planBadge.textContent = "Free Plan";
        upgradeLink.classList.remove('hidden');
      }
    }
  }
  // If on login page, check URL hash to toggle forms
  if (window.location.hash === "#signup") {
    showSignup();
  }
})();

// Show/hide the signup popup on homepage
function togglePopup(show) {
  const popup = document.getElementById('signup-popup');
  if (!popup) return;
  if (show) {
    popup.classList.remove('hidden');
  } else {
    popup.classList.add('hidden');
  }
}
// Optionally, trigger the popup after some delay on homepage
if (document.getElementById('signup-popup')) {
  setTimeout(() => { togglePopup(true); }, 30000); // show after 30 seconds
}

// Show signup form, hide login form
function showSignup() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('signup-form').classList.remove('hidden');
  return false;
}
// Show login form, hide signup form
function showLogin() {
  document.getElementById('signup-form').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
  return false;
}

// Handle user signup
async function handleSignup() {
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const errorEl = document.getElementById('signup-error');
  errorEl.textContent = "";
  try {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
      errorEl.textContent = error.message;
    } else {
      // Signup successful
      // Optionally, we might require email confirmation; for now assume instant login after signup.
      errorEl.style.color = 'green';
      errorEl.textContent = "Signup successful! Redirecting...";
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 1500);
    }
  } catch (err) {
    errorEl.textContent = "Signup failed. Please try again.";
  }
}

// Handle user login
async function handleLogin() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = "";
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = error.message;
    } else {
      // Login successful
      window.location.href = "dashboard.html";
    }
  } catch (err) {
    errorEl.textContent = "Login failed. Please try again.";
  }
}

// Logout function
async function handleLogout() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

// Dashboard nav: switch tool view
function showTool(tool) {
  const articleSec = document.getElementById('tool-article');
  const imageSec = document.getElementById('tool-image');
  const linkArticle = document.getElementById('nav-link-article');
  const linkImage = document.getElementById('nav-link-image');
  if (tool === 'article') {
    articleSec.classList.remove('hidden');
    imageSec.classList.add('hidden');
    linkArticle.classList.add('active');
    linkImage.classList.remove('active');
  } else if (tool === 'image') {
    articleSec.classList.add('hidden');
    imageSec.classList.remove('hidden');
    linkArticle.classList.remove('active');
    linkImage.classList.add('active');
  }
}

// Generate Article function
async function generateArticle() {
  const titleInput = document.getElementById('article-title');
  const outputDiv = document.getElementById('article-output');
  const loadingOverlay = document.getElementById('loading-spinner');
  const topic = titleInput.value.trim();
  if (!topic) return;
  outputDiv.innerHTML = "";  // clear previous content
  loadingOverlay.textContent = "✍️ Generating your article, please wait...";
  loadingOverlay.classList.remove('hidden');
  try {
    // Call the backend API endpoint to generate article
    const response = await fetch(`${API_BASE_URL}/generate-article`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // If the API expects an auth token to identify user, we could include supabase JWT:
        'Authorization': `Bearer ${supabaseClient.auth.session() ? supabaseClient.auth.session().access_token : ''}`
      },
      body: JSON.stringify({ title: topic })
    });
    loadingOverlay.classList.add('hidden');
    if (!response.ok) {
      outputDiv.innerHTML = `<p class="error-msg">Error: ${response.statusText}</p>`;
      return;
    }
    const data = await response.json();
    if (data.error) {
      outputDiv.innerHTML = `<p class="error-msg">Error: ${data.error}</p>`;
    } else {
      const articleText = data.article || data.content;
      const sources = data.sources || []; // assume backend might return an array of {url, title}
      let html = "";
      if (articleText) {
        // Basic formatting - if articleText contains newlines, convert to paragraphs
        const paragraphs = articleText.split(/\n\n+/);
        paragraphs.forEach(par => {
          const trimmed = par.trim();
          if (!trimmed) return;
          // If the paragraph text starts with certain tokens maybe it's a heading or list, simple detection:
          if (trimmed.match(/^#{1,6}\s/)) {
            // If the article text was in markdown format with # headings, convert to <hX>
            const level = trimmed.match(/^#+/)[0].length;
            const headingText = trimmed.replace(/^#{1,6}\s/, '');
            html += `<h${level}>${headingText}</h${level}>`;
          } else {
            html += `<p>${trimmed}</p>`;
          }
        });
      }
      if (sources.length > 0) {
        html += "<div class='citation'><strong>References:</strong><ol>";
        sources.forEach((src, index) => {
          const srcTitle = src.title || src.url;
          html += `<li><a href="${src.url}" target="_blank" rel="noopener">${srcTitle}</a></li>`;
        });
        html += "</ol></div>";
      }
      outputDiv.innerHTML = html;
    }
  } catch (err) {
    loadingOverlay.classList.add('hidden');
    outputDiv.innerHTML = `<p class="error-msg">Failed to generate article. Please try again.</p>`;
  }
}

// Generate Image function
async function generateImage() {
  const promptInput = document.getElementById('image-prompt');
  const outputDiv = document.getElementById('image-output');
  const loadingOverlay = document.getElementById('loading-spinner');
  const prompt = promptInput.value.trim();
  if (!prompt) return;
  outputDiv.innerHTML = "";
  loadingOverlay.textContent = "🎨 Generating image, please wait...";
  loadingOverlay.classList.remove('hidden');
  try {
    const response = await fetch(`${API_BASE_URL}/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt: prompt })
    });
    loadingOverlay.classList.add('hidden');
    if (!response.ok) {
      outputDiv.innerHTML = `<p class="error-msg">Error: ${response.statusText}</p>`;
      return;
    }
    const data = await response.json();
    if (data.error) {
      outputDiv.innerHTML = `<p class="error-msg">Error: ${data.error}</p>`;
    } else {
      const imageUrl = data.image_url || data.url;
      if (imageUrl) {
        outputDiv.innerHTML = `<img src="${imageUrl}" alt="Generated image">`;
      } else {
        outputDiv.innerHTML = `<p class="error-msg">No image URL returned.</p>`;
      }
    }
  } catch (err) {
    loadingOverlay.classList.add('hidden');
    outputDiv.innerHTML = `<p class="error-msg">Failed to generate image. Please try again.</p>`;
  }
}

// Handle Upgrade to Pro click
const upgradeBtn = document.getElementById('upgradeBtn');
if (upgradeBtn) {
  upgradeBtn.addEventListener('click', async () => {
    // Call backend to create Stripe checkout session
    try {
      const resp = await fetch(`${API_BASE_URL}/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: supabaseClient.auth.session()?.user.id || null })
      });
      const data = await resp.json();
      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
      } else {
        alert("Unable to redirect to payment. Please contact support.");
      }
    } catch (err) {
      alert("Error initiating upgrade: " + err.message);
    }
  });
}
