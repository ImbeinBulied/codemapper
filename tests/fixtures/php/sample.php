<?php

use App\Models\User;
use App\Services\AuthService;

interface Drawable {
    public function draw(): void;
}

trait Loggable {
    public function log(string $message): void {
        echo $message;
    }
}

enum Status: string {
    case Active = 'active';
    case Inactive = 'inactive';
}

class BaseEntity {
    protected string $id;

    public function __construct(string $id) {
        $this->id = $id;
    }
}

class User extends BaseEntity implements Drawable {
    use Loggable;

    private string $name;
    public readonly string $email;

    public function __construct(string $id, string $name, string $email) {
        parent::__construct($id);
        $this->name = $name;
        $this->email = $email;
    }

    public function draw(): void {
        echo $this->name;
    }

    public function getName(): string {
        return $this->name;
    }
}

function createUser(string $name): User {
    return new User('1', $name, 'test@example.com');
}
