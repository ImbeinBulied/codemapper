<?php

declare(strict_types=1);

// PHP 8 attributes
#[Route('/api/users')]
class UserController {
    #[Get('/{id}')]
    public function show(int $id): array {
        return ['id' => $id];
    }

    #[Post('/')]
    public function store(#[FromBody] UserDto $dto): User {
        return new User($dto);
    }
}

// Named arguments
function processString(string $input, bool $trim = true, bool $double_encode = true): string {
    return htmlspecialchars($input, double_encode: $double_encode);
}

// Match expressions (PHP 8+)
function describe($x): string {
    return match ($x) {
        1 => 'one',
        2 => 'two',
        3, 4 => 'three or four',
        default => 'other',
    };
}

// Fibers (PHP 8.1+)
function fiberExample(): void {
    $fiber = new Fiber(function (): void {
        $value = Fiber::suspend('fiber yielded');
        echo "Fiber resumed with: $value\n";
    });

    $value = $fiber->start();
    echo "Got from fiber: $value\n";
    $fiber->resume('hello');
}

// Intersection types (PHP 8.1+)
interface HasName {
    public function getName(): string;
}

interface HasAge {
    public function getAge(): int;
}

class Person2 implements HasName, HasAge {
    public function __construct(
        private string $name,
        private int $age,
    ) {}

    public function getName(): string { return $this->name; }
    public function getAge(): int { return $this->age; }
}

function greet(HasName&HasAge $person): string {
    return "Hello {$person->getName()}, age {$person->getAge()}";
}

// Enums (PHP 8.1+)
enum Color: string {
    case Red = 'red';
    case Green = 'green';
    case Blue = 'blue';
}

enum Status: int {
    case Pending = 0;
    case Active = 1;
    case Deleted = 2;
}

// Readonly properties (PHP 8.1+)
class Coordinate {
    public function __construct(
        public readonly float $latitude,
        public readonly float $longitude,
    ) {}
}

// First-class callable syntax (PHP 8.1+)
function firstClassCallable(): void {
    $strlen = strlen(...);
    $result = $strlen('hello');
}

// Named arguments in method calls
class Config {
    public function __construct(
        public string $host = 'localhost',
        public int $port = 8080,
        public bool $debug = false,
    ) {}
}

function createConfig(): Config {
    return new Config(debug: true, port: 3000);
}

// Null safe operator (PHP 8.0+)
class Order {
    public ?Customer $customer = null;
}

class Customer {
    public ?Address $address = null;
}

class Address {
    public string $city = 'Unknown';
}

function getCity(?Order $order): string {
    return $order?->customer?->address?->city ?? 'Unknown';
}

// Trailing comma in parameters
function trailingComma(
    string $a,
    int $b,
    bool $c = false,
) {
    return "$a $b";
}

// Constructor property promotion (PHP 8.0+)
class User {
    public function __construct(
        public string $name,
        public string $email,
        public readonly int $createdAt,
    ) {}
}

// Named enums with methods
enum Suit {
    case Hearts;
    case Diamonds;
    case Clubs;
    case Spades;

    public function color(): string {
        return match ($this) {
            self::Hearts, self::Diamonds => 'red',
            self::Clubs, self::Spades => 'black',
        };
    }
}

// Interface with default methods (PHP 8.0+ interface)
interface Logger {
    public function log(string $message): void;

    public function info(string $message): void {
        $this->log("[INFO] $message");
    }
}
