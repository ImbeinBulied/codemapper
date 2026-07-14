# Nested f-strings that could confuse regex
result = f"{' '.join(f'{x}' for x in range(10))}"
nested = f"prefix_{f'inner_{value}'}_suffix"

# Multiline strings that look like function defs
""" This looks like a function def foo(): """
''' This looks like a class Bar: '''

# Decorators on every function
@decorator_a
@decorator_b
@decorator_c
def heavily_decorated():
    pass

@staticmethod
@classmethod
@abstractmethod
def also_decorated():
    pass

# Walrus operator (Python 3.8+)
if (n := len([1, 2, 3])) > 10:
    pass

# Complex list comprehensions
result = [x * y for x in range(10) for y in range(10) if x != y]
nested_comp = [[j for j in range(i)] for i in range(10)]
dict_comp = {k: v for k, v in zip(keys, vals) if v is not None}
set_comp = {x ** 2 for x in range(100) if x % 2 == 0}

# Async generators
async def gen():
    yield await foo()
    yield from bar()

# String that looks like code but isn't
fake_code = """
def fake_function():
    class FakeClass:
        pass
"""

# Type hints with complex generics
from typing import Dict, List, Optional, Tuple, Set, Callable, Awaitable

ComplexType = Dict[str, List[Tuple[int, Optional[Callable[[str], Awaitable[bool]]]]]]

def complex_hint(x: ComplexType) -> Dict[str, Set[int]]:
    return {}

# Lambda with complex expression
fn = lambda x, y, z: x + y * z if z > 0 else x - y

# Multiple assignment
a, b, *rest = [1, 2, 3, 4, 5]
