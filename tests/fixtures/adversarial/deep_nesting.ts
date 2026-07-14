// Deeply nested classes (10+ levels) - valid TS with inner classes in methods
class Level0 {
  method0() {
    class Level1 {
      method1() {
        class Level2 {
          method2() {
            class Level3 {
              method3() {
                class Level4 {
                  method4() {
                    class Level5 {
                      method5() {
                        class Level6 {
                          method6() {
                            class Level7 {
                              method7() {
                                class Level8 {
                                  method8() {
                                    class Level9 {
                                      method9() {}
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

// Many functions (100+) to stress test parsing
function func_a0() {}
function func_a1() {}
function func_a2() {}
function func_a3() {}
function func_a4() {}
function func_a5() {}
function func_a6() {}
function func_a7() {}
function func_a8() {}
function func_a9() {}
function func_b0() {}
function func_b1() {}
function func_b2() {}
function func_b3() {}
function func_b4() {}
function func_b5() {}
function func_b6() {}
function func_b7() {}
function func_b8() {}
function func_b9() {}
function func_c0() {}
function func_c1() {}
function func_c2() {}
function func_c3() {}
function func_c4() {}
function func_c5() {}
function func_c6() {}
function func_c7() {}
function func_c8() {}
function func_c9() {}
function func_d0() {}
function func_d1() {}
function func_d2() {}
function func_d3() {}
function func_d4() {}
function func_d5() {}
function func_d6() {}
function func_d7() {}
function func_d8() {}
function func_d9() {}
function func_e0() {}
function func_e1() {}
function func_e2() {}
function func_e3() {}
function func_e4() {}
function func_e5() {}
function func_e6() {}
function func_e7() {}
function func_e8() {}
function func_e9() {}
function func_f0() {}
function func_f1() {}
function func_f2() {}
function func_f3() {}
function func_f4() {}
function func_f5() {}
function func_f6() {}
function func_f7() {}
function func_f8() {}
function func_f9() {}
function func_g0() {}
function func_g1() {}
function func_g2() {}
function func_g3() {}
function func_g4() {}
function func_g5() {}
function func_g6() {}
function func_g7() {}
function func_g8() {}
function func_g9() {}
function func_h0() {}
function func_h1() {}
function func_h2() {}
function func_h3() {}
function func_h4() {}
function func_h5() {}
function func_h6() {}
function func_h7() {}
function func_h8() {}
function func_h9() {}
function func_i0() {}
function func_i1() {}
function func_i2() {}
function func_i3() {}
function func_i4() {}
function func_i5() {}
function func_i6() {}
function func_i7() {}
function func_i8() {}
function func_i9() {}
function func_j0() {}
function func_j1() {}
function func_j2() {}
function func_j3() {}
function func_j4() {}
function func_j5() {}
function func_j6() {}
function func_j7() {}
function func_j8() {}
function func_j9() {}
function func_k0() {}
function func_k1() {}
function func_k2() {}
function func_k3() {}
function func_k4() {}
function func_k5() {}
function func_k6() {}
function func_k7() {}
function func_k8() {}
function func_k9() {}
function func_l0() {}
function func_l1() {}
function func_l2() {}
function func_l3() {}
function func_l4() {}
function func_l5() {}
function func_l6() {}
function func_l7() {}
function func_l8() {}
function func_l9() {}

// Complex generic types
type ComplexGeneric = Map<string, Array<Map<number, Set<string>>>>;
type NestedGeneric = Promise<Map<string, Set<Array<number>>>>;

// Circular-ish type references
type A = { b: B };
type B = { a: A };

// Enum with many values
enum Color {
  Red,
  Green,
  Blue,
  Yellow,
  Orange,
  Purple,
  Cyan,
  Magenta,
  White,
  Black,
  Gray,
  Brown,
  Pink,
  Indigo,
  Violet,
  Lime,
}

// Interface extending multiple interfaces
interface I1 {
  a: string;
}
interface I2 {
  b: number;
}
interface I3 {
  c: boolean;
}
interface I4 extends I1, I2, I3 {
  d: string;
}

// Class implementing multiple interfaces
class MultiImpl implements I1, I2, I3, I4 {
  a = '';
  b = 0;
  c = false;
  d = '';
}
