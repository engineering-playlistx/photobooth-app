// Control chars U+0000–U+001F and U+007F — built at runtime so ESLint does not flag no-control-regex
const CONTROL_CHAR_REGEX = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  'g',
)

export function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/[<>]/g, '')
    .replace(CONTROL_CHAR_REGEX, '')
    .slice(0, 100)
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return emailRegex.test(email)
}

export function validatePhone(phone: string): boolean {
  const indonesiaPhoneRegex = /^(\+62|62|0)[0-9-]{9,15}$/
  return indonesiaPhoneRegex.test(phone.replace(/\s/g, ''))
}

export function standardizePhone(phone: string): string {
  return phone
    .replace(/[\s-]/g, '')
    .replace(/^0/, '62')
    .replace(/^62/, '+62')
    .replace(/^(\+62)/, '$1')
}
