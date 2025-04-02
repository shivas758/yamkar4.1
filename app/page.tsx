"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAuth } from "@/contexts/auth-context"
import { loginSchema } from "@/lib/validations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Image from "next/image"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

type FormData = {
  phone: string
  password: string
}

export default function LoginPage() {
  const { login, user } = useAuth()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (user) {
      router.push(`/${user.role}`);
    }
  }, [user, router, isLoading]);

  const form = useForm<FormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      phone: "",
      password: "",
    },
  })

  const onSubmit = async (data: FormData) => {
    try {
      setIsLoading(true)
      await login(data.phone, data.password)
    } catch (error) {
      if (error instanceof Error && error.message.includes("pending admin approval")) {
        toast({
          title: "Account Pending Approval",
          description: "Your account is pending admin approval. Please wait for approval before logging in.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Login failed",
          variant: "destructive",
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#f0f4ff] to-[#F8F8FF] p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-28 w-72 relative transform hover:scale-105 transition-transform duration-300">
            <Image
              src="/images/V Cards yamkar logo_page-0001.jpg"
              alt="Yamkar Logo"
              fill
              style={{ objectFit: 'contain' }}
              priority
              className="drop-shadow-lg"
            />
          </div>
          <p className="text-[#006DA8] text-base font-medium tracking-wide">Employee Management System</p>
        </div>

        <div className="bg-white/95 backdrop-blur-sm p-8 rounded-xl shadow-lg border border-gray-100">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700">Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter your phone number"
                        {...field}
                        type="tel"
                        maxLength={10}
                        className="border-gray-200 focus:border-[#228B22] focus:ring-[#228B22] transition-colors duration-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700">Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Enter your password"
                        className="border-gray-200 focus:border-[#228B22] focus:ring-[#228B22] transition-colors duration-200"
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full bg-[#006DA8] hover:bg-[#006DA8] text-white font-bold transition-colors duration-200 py-5"
                disabled={isLoading}
              >
                {isLoading ? "Logging in..." : "Login"}
              </Button>
            </form>
          </Form>

          <div className="mt-6 space-y-4">
            <div className="text-center">
              <a href="/forgot-password" className="text-[#006DA8] hover:text-[#F8821E] transition-colors duration-200 text-sm hover:underline">
                Forgot Password?
              </a>
            </div>

            <div className="text-center">
              <a href="/signup" className="text-[#006DA8] hover:text-[#F8821E] transition-colors duration-200 text-sm hover:underline">
                Create Account
              </a>
            </div>

            <div className="text-center text-sm text-gray-400">
              © {new Date().getFullYear()} Yamkar. All rights reserved.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
