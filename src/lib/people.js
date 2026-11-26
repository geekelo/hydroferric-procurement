export const AVATAR_TONES = ['purple', 'teal', 'magenta', 'good', 'info']

export function initials(name) {
  return String(name || '').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'
}
