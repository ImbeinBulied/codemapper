use std::fmt;

mod utils;

pub struct Point {
    x: f64,
    y: f64,
}

pub enum Direction {
    North, South, East, West,
}

pub trait Shape {
    fn area(&self) -> f64;
}

struct Circle {
    radius: f64,
}

impl Shape for Circle {
    fn area(&self) -> f64 {
        self.radius * self.radius * std::f64::consts::PI
    }
}

fn calculate_twice(radius: f64) -> f64 {
    let c = Circle { radius };
    c.area() * 2.0
}
