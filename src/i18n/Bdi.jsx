/**
 * Bdi — isolates an identifier from the direction of the text around it.
 *
 * This matters more here than in most apps, because nearly every screen prints
 * a phone number, extension, SIP URI, IP or UUID inside Hebrew prose or a
 * Hebrew table. Those strings are left-to-right, but their punctuation is
 * directionally NEUTRAL, so the Unicode bidi algorithm resolves it into the
 * surrounding right-to-left run and moves it to the wrong end:
 *
 *   +972-3-555-1234   renders as   972-3-555-1234+
 *   sip:101@pbx.local  breaks at the @
 *   (555) 1234         loses its brackets to opposite sides
 *
 * `<bdi>` is exactly the element for this — it opens its own isolated bidi
 * context — and `dir="ltr"` pins that context the right way regardless of the
 * page. It is inline and carries no styling, so it is a safe wrap anywhere a
 * `<span>` would go.
 *
 * None of this is visible in English, which is precisely why it needs a
 * primitive rather than discipline: the bug cannot be seen until the UI is
 * Hebrew, and by then it is spread across every screen.
 *
 *   <Bdi>{did.number}</Bdi>
 *   <Bdi>{`sip:${ext}@${domain}`}</Bdi>
 *
 * For a value that may be empty, prefer the table helper (`orEmpty`) on the
 * outside: <Bdi>{orEmpty(row.number)}</Bdi>.
 */
const Bdi = ({ children, ...rest }) => (
  <bdi dir="ltr" {...rest}>{children}</bdi>
);

export default Bdi;
