"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Users, Shield, Clock, Key, Download } from "lucide-react"
import Link from "next/link"
import { useState, useEffect } from "react"
import PasswordChangePopup from "@/components/PasswordChangePopup"
import { supabase } from "@/lib/supabaseClient"
import { Skeleton } from "@/components/ui/skeleton"

export default function AdminDashboard() {
  const [showPasswordChangePopup, setShowPasswordChangePopup] = useState(false);
  const [stats, setStats] = useState([
    { label: "Total Managers", value: "-", isLoading: true },
    { label: "Total Employees", value: "-", isLoading: true },
    { label: "Pending Approvals", value: "-", isLoading: true },
    { label: "Active Users", value: "-", isLoading: true },
  ]);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        // Fetch total managers count
        const { count: managerCount, error: managerError } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'manager');

        if (managerError) throw managerError;

        // Fetch total employees count
        const { count: employeeCount, error: employeeError } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'employee');

        if (employeeError) throw employeeError;

        // Fetch pending approvals count
        const { count: pendingCount, error: pendingError } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

        if (pendingError) throw pendingError;

        // Fetch active users (users who checked in within the last 8 hours)
        // We can't directly use the timezone-specific SQL, so we'll use a simpler approach
        const eightHoursAgo = new Date();
        eightHoursAgo.setHours(eightHoursAgo.getHours() - 8);
        
        const { data: activeUsersData, error: activeUsersError } = await supabase
          .from('attendance_logs')
          .select('user_id')
          .gte('check_in', eightHoursAgo.toISOString())
          .is('check_out', null);  // Still checked in
        
        if (activeUsersError) throw activeUsersError;
        
        // Count unique users
        const uniqueUserIds = new Set(activeUsersData?.map(log => log.user_id) || []);
        const activeCount = uniqueUserIds.size;

        setStats([
          { label: "Total Managers", value: managerCount?.toString() || "0", isLoading: false },
          { label: "Total Employees", value: employeeCount?.toString() || "0", isLoading: false },
          { label: "Pending Approvals", value: pendingCount?.toString() || "0", isLoading: false },
          { label: "Active Users", value: activeCount?.toString() || "0", isLoading: false },
        ]);
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        // Set error state or handle accordingly
        setStats(prev => prev.map(stat => ({ ...stat, isLoading: false })));
      }
    };

    fetchDashboardStats();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#228B22]">Admin Dashboard</h1>
        <p className="text-[#6B8E23]">System Administration</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              {stat.isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <div className="text-2xl font-bold text-[#228B22]">{stat.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="h-12 w-12 rounded-full bg-[#228B22] bg-opacity-10 flex items-center justify-center">
                <Users className="h-6 w-6 text-[#228B22]" />
              </div>
              <Button variant="ghost" className="text-[#6B8E23]" asChild>
                <Link href="/admin/managers">View Managers</Link>
              </Button>
            </div>
            <h2 className="text-lg font-semibold mb-2">Manager Management</h2>
            <p className="text-sm text-muted-foreground">View and manage manager accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="h-12 w-12 rounded-full bg-[#228B22] bg-opacity-10 flex items-center justify-center">
                <Users className="h-6 w-6 text-[#228B22]" />
              </div>
              <Button variant="ghost" className="text-[#6B8E23]" asChild>
                <Link href="/admin/employees">View Employees</Link>
              </Button>
            </div>
            <h2 className="text-lg font-semibold mb-2">Employee Management</h2>
            <p className="text-sm text-muted-foreground">View and manage all employee accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="h-12 w-12 rounded-full bg-[#228B22] bg-opacity-10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-[#228B22]" />
              </div>
              <Button variant="ghost" className="text-[#6B8E23]" asChild>
                <Link href="/admin/approvals">View Approvals</Link>
              </Button>
            </div>
            <h2 className="text-lg font-semibold mb-2">Pending Approvals</h2>
            <p className="text-sm text-muted-foreground">Review and approve new account requests</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="h-12 w-12 rounded-full bg-[#228B22] bg-opacity-10 flex items-center justify-center">
                <Download className="h-6 w-6 text-[#228B22]" />
              </div>
              <Button variant="ghost" className="text-[#6B8E23]" asChild>
                <Link href="/admin/reports">View Reports</Link>
              </Button>
            </div>
            <h2 className="text-lg font-semibold mb-2">Reports</h2>
            <p className="text-sm text-muted-foreground">View and export attendance and farmer data reports</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="h-12 w-12 rounded-full bg-[#228B22] bg-opacity-10 flex items-center justify-center">
                <Key className="h-6 w-6 text-[#228B22]" />
              </div>
              <Button 
                variant="ghost" 
                className="text-[#6B8E23]"
                onClick={() => setShowPasswordChangePopup(true)}
              >
                Change Password
              </Button>
            </div>
            <h2 className="text-lg font-semibold mb-2">Password</h2>
            <p className="text-sm text-muted-foreground">Update your account password</p>
          </CardContent>
        </Card>
      </div>

      {/* Password Change Popup */}
      <PasswordChangePopup
        isOpen={showPasswordChangePopup}
        onClose={() => setShowPasswordChangePopup(false)}
      />
    </div>
  )
}

