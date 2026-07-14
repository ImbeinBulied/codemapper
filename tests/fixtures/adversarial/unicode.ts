// Unicode identifiers that might trip up regex parsers
const Δ = () => {};
const π = 3.14159;
const foo_Ω_bar = () => {};
const 中文函数 = () => {};

// Shebang should be ignored, not treated as code
// The TS compiler handles this fine, but regex parsers might choke

// Complex generic types
type ComplexGeneric = Map<string, Array<Map<number, Set<string>>>>;
type NestedGeneric = Promise<Map<string, Set<Array<number>>>>;

// Circular-ish type references
type Alpha = { beta: Beta };
type Beta = { alpha: Alpha };

// File with string literals that look like function declarations
const fakeFunc = 'function foo() {}';
const fakeClass = 'class Bar {}';
const fakeImport = "import { x } from 'y'";

// Property access chains (shouldn't create extra nodes)
const obj = { a: { b: { c: () => 42 } } };
