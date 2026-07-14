using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Adversarial
{
    // Nullable reference types
    public class NullableTest
    {
        public string? Name { get; set; }
        public int? Age { get; set; }
        public List<string>? Items { get; set; }

        public string? Process(string? input)
        {
            return input?.Trim();
        }
    }

    // Pattern matching
    public class PatternMatch
    {
        public string Describe(object obj)
        {
            if (obj is string s && s.Length > 0)
                return $"string: {s}";
            if (obj is int i and > 0 and < 100)
                return $"small int: {i}";
            if (obj is not null)
                return "non-null";
            return "null";
        }

        public string Switch(object obj)
        {
            return obj switch
            {
                string s when s.Length > 10 => "long string",
                string s => $"short string: {s}",
                int i and > 0 => $"positive int: {i}",
                int i => $"non-positive int: {i}",
                null => "null",
                _ => "other"
            };
        }
    }

    // LINQ expressions
    public class LinqTest
    {
        public IEnumerable<int> GetEvens(IEnumerable<int> numbers)
        {
            return numbers
                .Where(n => n % 2 == 0)
                .OrderBy(n => n)
                .Select(n => n * 2)
                .Distinct()
                .Take(10);
        }

        public var GroupBy(IEnumerable<string> items)
        {
            return items.GroupBy(i => i.Length)
                        .Select(g => new { Length = g.Key, Count = g.Count() });
        }
    }

    // Async streams (C# 8+)
    public class AsyncStreamTest
    {
        public async IAsyncEnumerable<int> GenerateAsync()
        {
            for (int i = 0; i < 10; i++)
            {
                await Task.Delay(100);
                yield return i;
            }
        }

        public async IAsyncEnumerable<string> ReadLinesAsync(string path)
        {
            using var reader = new System.IO.StreamReader(path);
            while (await reader.ReadLineAsync() is string line)
            {
                yield return line;
            }
        }
    }

    // Record types (C# 9+)
    public record Person(string Name, int Age);
    public record Address(string Street, string City, string Zip);
    public record Employee(string Name, int Age, string Department) : Person(Name, Age);

    // Record with custom members
    public record Point(double X, double Y)
    {
        public double DistanceTo(Point other) =>
            Math.Sqrt(Math.Pow(X - other.X, 2) + Math.Pow(Y - other.Y, 2));
    }

    // Complex generic constraints
    public class Repository<T> where T : class, IComparable<T>, new()
    {
        private readonly List<T> items = new();

        public void Add(T item) => items.Add(item);
        public T Find(Func<T, bool> predicate) => items.First(predicate);
    }

    // Expression-bodied members
    public class MathHelper
    {
        public int Square(int x) => x * x;
        public int Add(int a, int b) => a + b;
        public string Greeting => "Hello, World!";
    }

    // Nullable value types
    public class NullableValueTest
    {
        public int? NullableInt { get; set; }
        public double? NullableDouble { get; set; }
        public bool? NullableBool { get; set; }
    }
}
