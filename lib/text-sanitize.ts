/**
 * lib/text-sanitize.ts
 *
 * Sanitize text for USPTO Patent Center .txt upload (strict ASCII).
 * Patent Center rejects any .txt file containing characters outside 0x00–0x7F.
 *
 * Usage:
 *   import { sanitizeForUspto } from '@/lib/text-sanitize'
 *   const clean = sanitizeForUspto(specDraft)
 */

const TEXT_REPLACEMENTS: [string, string][] = [
  ['\u2018', "'"],        // left single quote
  ['\u2019', "'"],        // right single quote
  ['\u201c', '"'],        // left double quote
  ['\u201d', '"'],        // right double quote
  ['\u2013', '-'],        // en dash
  ['\u2014', '--'],       // em dash
  ['\u2026', '...'],      // ellipsis
  ['\u00a0', ' '],        // non-breaking space
  ['\u00ae', '(R)'],      // registered trademark
  ['\u00a9', '(c)'],      // copyright
  ['\u2122', '(TM)'],     // trademark
  ['\u2022', '*'],        // bullet
  ['\u00b7', '*'],        // middle dot
  ['\u00b0', ' degrees'], // degree symbol
  ['\u00d7', 'x'],        // multiplication sign
  ['\u00f7', '/'],        // division sign
  ['\u00e9', 'e'],        // e acute (accented)
  ['\u00e8', 'e'],        // e grave
  ['\u00e0', 'a'],        // a grave
  ['\u00fc', 'u'],        // u umlaut
  ['\u00f6', 'o'],        // o umlaut
  ['\u00e4', 'a'],        // a umlaut
  ['\u00f1', 'n'],        // n tilde
  ['\u00ab', '"'],        // left-pointing double angle quotation
  ['\u00bb', '"'],        // right-pointing double angle quotation
  ['\u2039', "'"],        // single left-pointing angle quotation
  ['\u203a', "'"],        // single right-pointing angle quotation
  ['\u00ad', '-'],        // soft hyphen
  ['\u2011', '-'],        // non-breaking hyphen
  ['\u2012', '-'],        // figure dash
  ['\u2015', '--'],       // horizontal bar
  ['\u00a7', 'S.'],       // section sign
  ['\u00b6', 'P.'],       // pilcrow / paragraph sign
  ['\u2020', '*'],        // dagger
  ['\u2021', '**'],       // double dagger
  ['\u00a6', '|'],        // broken bar
  ['\u00b1', '+/-'],      // plus-minus sign
  ['\u2248', '~='],       // almost equal to
  ['\u2260', '!='],       // not equal to
  ['\u2264', '<='],       // less-than or equal to
  ['\u2265', '>='],       // greater-than or equal to
  ['\u00b2', '2'],        // superscript 2
  ['\u00b3', '3'],        // superscript 3
  ['\u00bc', '1/4'],      // vulgar fraction one quarter
  ['\u00bd', '1/2'],      // vulgar fraction one half
  ['\u00be', '3/4'],      // vulgar fraction three quarters
  ['\u2153', '1/3'],      // vulgar fraction one third
  ['\u2154', '2/3'],      // vulgar fraction two thirds
  ['\u00b5', 'u'],        // micro sign (mu)
  ['\u03b1', 'alpha'],    // Greek small letter alpha
  ['\u03b2', 'beta'],     // Greek small letter beta
  ['\u03b3', 'gamma'],    // Greek small letter gamma
  ['\u03b4', 'delta'],    // Greek small letter delta
  ['\u03b5', 'epsilon'],  // Greek small letter epsilon
  ['\u03bb', 'lambda'],   // Greek small letter lambda
  ['\u03bc', 'mu'],       // Greek small letter mu
  ['\u03c0', 'pi'],       // Greek small letter pi
  ['\u03c3', 'sigma'],    // Greek small letter sigma
  ['\u03c9', 'omega'],    // Greek small letter omega
  ['\u03a9', 'ohm'],      // Greek capital letter omega / ohm
]

export function sanitizeForUspto(input: string): string {
  if (!input) return ''
  let result = input
  for (const [char, replacement] of TEXT_REPLACEMENTS) {
    result = result.split(char).join(replacement)
  }
  // Strip anything remaining outside printable ASCII + tabs/newlines/CR
  // Keep: HT (0x09), LF (0x0A), CR (0x0D), space through tilde (0x20–0x7E)
  result = result.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
  return result
}
