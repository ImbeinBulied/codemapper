import Foundation

// Property wrappers
@propertyWrapper
struct Clamped {
    private var value: Int
    var wrappedValue: Int {
        get { value }
        set { value = min(max(newValue, 0), 100) }
    }
    init(wrappedValue: Int) {
        self.value = min(max(wrappedValue, 0), 100)
    }
}

// Complex closures with capture lists
func complexClosure() {
    var x = 10
    let closure1 = { [weak self] (x: Int) -> String in "\(x)" }
    let closure2 = { [unowned self] () -> Void in print("hello") }
    let closure3 = { [x] () -> Int in return x }
    let closure4 = { (y: Int) -> Int in x + y }

    // Trailing closure syntax
    let result = [1, 2, 3].map { $0 * 2 }
    let filtered = [1, 2, 3].filter { $0 > 1 }
    let summed = [1, 2, 3].reduce(0, +)
}

// Protocol extensions
protocol Describable {
    var description: String { get }
}

extension Describable {
    var description: String { return "Default description" }
    func describe() -> String { return description }
}

// Protocol with associated types
protocol Container {
    associatedtype Item
    var count: Int { get }
    mutating func push(_ item: Item)
    mutating func pop() -> Item?
}

// Opaque return types
func makeArray() -> some Collection {
    return [1, 2, 3]
}

func makeOptional() -> some ExpressibleByNilLiteral {
    return Optional<Int>.none
}

// Result builders (simplified usage)
struct HTMLBuilder {
    func buildBlock(_ components: String...) -> String {
        components.joined()
    }
}

// Complex enum with associated values
enum Result<Success, Failure: Error> {
    case success(Success)
    case failure(Failure)

    var isSuccess: Bool {
        switch self {
        case .success: return true
        case .failure: return false
        }
    }
}

enum NetworkError: Error {
    case invalidURL
    case timeout(Int)
    case httpError(statusCode: Int, message: String)
}

// Extension on standard library types
extension Array where Element: Numeric {
    func sum() -> Element {
        return reduce(0, +)
    }
}

extension Optional where Wrapped == String {
    var orEmpty: String {
        return self ?? ""
    }
}

// Generic struct with protocol constraints
struct SortedArray<Element: Comparable> {
    private var elements: [Element] = []

    mutating func insert(_ element: Element) {
        let index = elements.firstIndex { $0 > element } ?? elements.endIndex
        elements.insert(element, at: index)
    }
}

// Subscript overloads
class Matrix {
    let rows: Int, cols: Int
    var grid: [Double]

    init(rows: Int, cols: Int) {
        self.rows = rows
        self.cols = cols
        self.grid = Array(repeating: 0, count: rows * cols)
    }

    subscript(row: Int, col: Int) -> Double {
        get { grid[row * cols + col] }
        set { grid[row * cols + col] = newValue }
    }
}

func main() {
    print("Hello, Swift!")
}
