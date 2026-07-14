package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
)

//go:build ignore
// +build ignore

// Complex interfaces
type ReadWriter interface {
	io.Reader
	io.Writer
}

type Handler interface {
	ServeHTTP(ResponseWriter, *Request)
}

// Embedded interfaces
type Animal interface {
	Speak() string
}

type Pet interface {
	Animal
	Name() string
	Owner() string
}

// Channel types
func channelTypes() {
	ch1 := make(chan int)
	ch2 := make(chan func() int)
	ch3 := make(chan []byte, 100)
	ch4 := make(chan map[string]int)
	ch5 := make(chan *sync.Mutex)
}

// Variadic functions with complex types
func variadicComplex(args ...func(int) error) error {
	return nil
}

func variadicInterface(args ...interface{}) {
	for _, arg := range args {
		fmt.Println(arg)
	}
}

// Function types
type Middleware func(http.Handler) http.Handler
type ErrorHandler func(w http.ResponseWriter, r *http.Request, err error)

// Struct with embedded fields
type Server struct {
	http.Handler
	mux    *http.ServeMux
	addr   string
	once   sync.Once
}

func (s *Server) Start() error {
	s.once.Do(func() {
		fmt.Println("starting")
	})
	return nil
}

// Complex type assertions
func typeSwitch(x interface{}) string {
	switch v := x.(type) {
	case string:
		return strings.ToUpper(v)
	case int:
		return fmt.Sprintf("%d", v)
	case []byte:
		return string(v)
	case map[string]string:
		return fmt.Sprintf("%v", v)
	default:
		return "unknown"
	}
}

// Variadic generic-like patterns (pre-generics)
type StringSlice []string
type IntSlice []int

func merge(a, b StringSlice) StringSlice {
	return append(a, b...)
}

// Interface satisfaction
var _ io.Reader = (*Server)(nil)
var _ http.Handler = (*Server)(nil)

// Go-routine with closure
func startWorkers(n int) {
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			fmt.Println(id)
		}(i)
	}
	wg.Wait()
}

func main() {
	fmt.Println("hello")
}
