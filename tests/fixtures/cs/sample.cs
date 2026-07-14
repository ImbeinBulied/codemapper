using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MyApp.Models
{
    public interface IAnimal
    {
        string Name { get; }
        void Speak();
    }

    public abstract class BaseCreature : IAnimal
    {
        public string Name { get; set; }
        public abstract void Speak();
    }

    public class Dog : BaseCreature
    {
        public override void Speak()
        {
            Console.WriteLine("Woof");
        }

        public async Task<string> FetchAsync(string item)
        {
            await Task.Delay(100);
            return item;
        }
    }

    public struct Point
    {
        public double X;
        public double Y;
    }

    public enum Color
    {
        Red,
        Green,
        Blue
    }

    public static class MathHelper
    {
        public static int Add(int a, int b) => a + b;
    }
}
