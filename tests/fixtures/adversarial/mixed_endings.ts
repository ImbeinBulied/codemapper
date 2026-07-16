// Mixed CRLF/LF line endings - this file contains \r\n on some lines and \n on others
// The parser should handle both gracefully and not crash
function normalFunction() {}
function anotherFunction() {}
class MixedEndings {
  method() {}
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- adversarial fixture
interface IMixed {}
type MixedType = string;
