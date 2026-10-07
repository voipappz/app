// Keeps a left-to-right fragment (address, phone number, extension, SIP URI)
// readable inside Hebrew text: without it "localhost:3000/" can come out as
// "/localhost:3000". Invisible in English.
export default function Bdi({ children, ...rest }) {
  return <bdi dir="ltr" {...rest}>{children}</bdi>;
}
