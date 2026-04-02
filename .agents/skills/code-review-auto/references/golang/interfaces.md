# Go Interfaces and Types Code Review Standards

Idiomatic Go leverages small interfaces and value semantics effectively.

## 1. Accept Interfaces, Return Structs
This is the Golden Rule of Go API design.
- **Return Structs:** Functions should return concrete types (structs or pointers to structs). This allows adding new methods to the returned type in the future without breaking callers.
- **Accept Interfaces:** Functions should accept interfaces representing the specific behaviors they need.
- **Review Action:** Flag functions that return interfaces unnecessarily, or constructors that return an interface instead of a pointer to a struct.

## 2. Interface Definition Ownership
Interfaces belong to the **consumer**, not the producer/implementer.
- Do not define an interface next to the struct that implements it simply for the sake of "mocking". Let the package that depends on the functionality define the interface it requires.
- Interfaces should be small (1-3 methods, like `io.Reader` or `io.Writer`).

## 3. Pointers vs Values
Go uses pass-by-value. Pointers are for mutation or large struct optimization.
- **Receiver Types:** If any method of a struct needs a pointer receiver (to mutate data), ALL methods on that struct should use pointer receivers for consistency.
- You almost never need a pointer to an interface/slice/map, as they are inherently reference-like types.

## 4. Struct Initialization
- Always use named fields when initializing structs `MyStruct{FieldA: "value"}`. Omit zero value fields.
- Avoid passing massive "naked" parameters into functions; prefer structs for complex configurations.
