export function showToast(message, type = '') {
  const container = document.getElementById('notification-container');
  if (!container) {
    console.warn('Toast container not found');
    return;
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type) toast.classList.add(type);
  toast.textContent = message;
  container.appendChild(toast);
  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('show'));
  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3000);
}
