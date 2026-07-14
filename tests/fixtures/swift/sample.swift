import Foundation
import UIKit

protocol Animal {
    var name: String { get }
    func speak()
}

class Dog: Animal {
    var name: String

    init(name: String) {
        self.name = name
    }

    func speak() {
        print("Woof")
    }

    func fetch(item: String) -> String {
        return item
    }
}

struct Point {
    var x: Double
    var y: Double
}

enum Color {
    case red
    case green
    case blue
}

extension Dog {
    func describe() -> String {
        return "A dog named \(name)"
    }
}

public class ServiceManager {
    private var isActive: Bool = true

    public func start() {
        isActive = true
    }

    private func stop() {
        isActive = false
    }
}

typealias Handler = (String) -> Void
