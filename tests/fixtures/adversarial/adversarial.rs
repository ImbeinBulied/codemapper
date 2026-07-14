// Complex lifetime annotations
fn complex_lifetimes<'a, 'b, 'c>(x: &'a str, y: &'b str) -> &'c str
where
    'a: 'b,
    'b: 'c,
{
    x
}

// Macros that look like functions
fn uses_macros() {
    let v = vec![1, 2, 3];
    println!("hello {}", v.len());
    assert_eq!(1, 1);
    debug_assert!(true);
    dbg!(42);
    todo!("implement later");
    unimplemented!("not yet");
    unreachable!("should not reach");
    format!("value: {}", 42);
    panic!("crash");
    include_str!("file.txt");
    include_bytes!("file.bin");
    cfg!(feature = "test");
    concat!("hello", " ", "world");
    stringify!(foo);
    env!("CARGO_PKG_VERSION");
    option_env!("MY_VAR");
    line!();
    column!();
    file!();
    module_path!();
    compile_error!("error");
    log::info!("logging");
    tracing::debug!("tracing");
}

// Nested impl blocks
struct Foo;
impl Foo {
    fn method_a(&self) {}
    impl Inner {
        fn inner_method(&self) {}
    }
}

// Trait objects
fn trait_objects() {
    let _: Box<dyn Fn(i32) -> i32>;
    let _: Box<dyn FnMut() -> String>;
    let _: Box<dyn FnOnce() -> Result<(), Error>>;
    let _: &dyn Display;
    let _: Box<dyn Any + Send + Sync>;
}

// Complex generic bounds
fn complex_bounds<T, U>(t: T, u: U) -> T
where
    T: Clone + Debug + 'static + Send + Sync,
    U: Into<T> + From<T> + AsRef<str>,
{
    t
}

// Complex type aliases
type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
type Callback = Box<dyn Fn(i32) -> i32 + Send + Sync + 'static>;
type Handler = fn(&mut Request) -> Response;

// Nested structs with lifetime annotations
struct Context<'a> {
    data: &'a [u8],
    cursor: usize,
}

impl<'a> Context<'a> {
    fn read(&mut self) -> Option<&'a [u8]> {
        Some(&self.data[self.cursor..])
    }
}

// Multiple trait implementations
trait Drawable {
    fn draw(&self);
}

trait Resizable {
    fn resize(&mut self, factor: f64);
}

struct Circle {
    radius: f64,
}

impl Drawable for Circle {
    fn draw(&self) {}
}

impl Resizable for Circle {
    fn resize(&mut self, factor: f64) {
        self.radius *= factor;
    }
}

// Conditional compilation
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic() {
        assert!(true);
    }
}
