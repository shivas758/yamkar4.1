"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Download } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabaseClient"
import { startOfMonth, endOfMonth, format } from "date-fns"

interface AttendanceRecord {
  id: string
  user: {
    name: string
    email: string
    role: string
    phone: string
    driving_license: string
    aadhar_number: string
    pan_number: string
    cadre: {
      name: string
    }
    manager: {
      name: string
    } | null
    state: {
      state_name: string
    }
    district: {
      district_name: string
    }
    mandal: {
      mandal_name: string
    }
  }
  check_in: string
  check_out: string | null
  duration_minutes: number
  check_in_meter_reading: string
  check_out_meter_reading: string | null
  check_in_meter_image: string
  check_out_meter_image: string | null
  distance_traveled: number
  created_at: string
}

interface FarmerCollection {
  id: string
  created_at: string
  name: string
  mobile_number: string
  email: string
  crop: {
    name: string
  }
  company: {
    name: string
  }
  state: {
    state_name: string
  }
  district: {
    district_name: string
  }
  mandal: {
    mandal_name: string
  }
  village: {
    name: string
  }
  social_media: string
  collected_by: {
    name: string
    role: string
    cadre: {
      name: string
    }
  }
}

export default function Reports() {
  const { user } = useAuth()
  const [fromDate, setFromDate] = useState<Date>(() => {
    const today = new Date()
    const firstDay = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1))
    return firstDay
  })
  const [toDate, setToDate] = useState<Date>(() => {
    const today = new Date()
    const utcToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999))
    return utcToday
  })
  const [userType, setUserType] = useState<"all" | "employee" | "manager">("all")
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [farmerCollections, setFarmerCollections] = useState<FarmerCollection[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("attendance")

  useEffect(() => {
    if (activeTab === "attendance") {
      fetchAttendanceRecords()
    } else {
      fetchFarmerCollections()
    }
  }, [fromDate, toDate, userType, activeTab])

  const fetchAttendanceRecords = async () => {
    if (!user) return
    setIsLoading(true)

    try {
      let query = supabase
        .from('attendance_logs')
        .select(`
          id,
          check_in,
          check_out,
          duration_minutes,
          check_in_meter_reading,
          check_out_meter_reading,
          check_in_meter_image,
          check_out_meter_image,
          distance_traveled,
          created_at,
          user:users!inner(
            name,
            email,
            role,
            phone,
            driving_license,
            aadhar_number,
            pan_number,
            cadre:cadres(name),
            state:states(state_name),
            district:districts(district_name),
            mandal:mandals(mandal_name),
            manager_id
          )
        `)
        .gte('check_in', fromDate.toISOString())
        .lte('check_in', toDate.toISOString())

      if (userType !== "all") {
        query = query.eq('user.role', userType)
      }

      query = query.order('check_in', { ascending: false })

      const { data, error } = await query

      if (error) {
        console.error("Error fetching attendance records:", error)
        return
      }

      // Fetch manager names separately
      if (data) {
        const managerIds = [...new Set(data.map(record => record.user?.manager_id).filter(Boolean))]
        const { data: managerData, error: managerError } = await supabase
          .from('users')
          .select('id, name')
          .in('id', managerIds)

        if (managerError) {
          console.error("Error fetching manager data:", managerError)
          return
        }

        // Create a map of manager IDs to names
        const managerMap = new Map(managerData?.map(m => [m.id, m.name]) || [])

        // Add manager names to the records
        const recordsWithManagerNames = data.map(record => ({
          ...record,
          user: {
            ...record.user,
            manager: record.user?.manager_id ? { name: managerMap.get(record.user.manager_id) || "N/A" } : null
          }
        }))

        setAttendanceRecords(recordsWithManagerNames)
      } else {
        setAttendanceRecords([])
      }
    } catch (error) {
      console.error("Error fetching attendance records:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchFarmerCollections = async () => {
    if (!user) return
    setIsLoading(true)

    try {
      const { data, error } = await supabase
        .from('farmers')
        .select(`
          id,
          created_at,
          name,
          mobile_number,
          email,
          crop:crops(name),
          company:companies(name),
          state:states(state_name),
          district:districts(district_name),
          mandal:mandals(mandal_name),
          village:villages(name),
          social_media,
          collected_by:users(
            name,
            cadre:cadres(name)
          )
        `)
        .gte('created_at', fromDate.toISOString())
        .lte('created_at', toDate.toISOString())
        .order('created_at', { ascending: false })

      if (error) {
        console.error("Error fetching farmer collections:", error)
        return
      }

      setFarmerCollections(data || [])
    } catch (error) {
      console.error("Error fetching farmer collections:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const exportAttendanceToCSV = () => {
    const headers = [
      "Employee Name",
      "Email",
      "Phone",
      "Role",
      "Manager",
      "Cadre",
      "Check In Date",
      "Check In Time",
      "Check Out Date",
      "Check Out Time",
      "Duration (mins)",
      "Distance (km)",
      "Aadhar Number",
      "Driving License",
      "PAN Number",
      "State",
      "District",
      "Mandal",
      "Check In Meter Reading",
      "Check Out Meter Reading",
      "Check In Meter Image",
      "Check Out Meter Image"
    ]

    const csvData = attendanceRecords.map(record => {
      // Format Aadhar Number and Driving License as strings to prevent scientific notation
      const aadharNumber = record.user?.aadhar_number ? `="${record.user.aadhar_number}"` : "N/A"
      const drivingLicense = record.user?.driving_license ? `="${record.user.driving_license}"` : "N/A"

      return {
        "Employee Name": record.user?.name || "N/A",
        "Email": record.user?.email || "N/A",
        "Phone": record.user?.phone || "N/A",
        "Role": record.user?.role || "N/A",
        "Manager": record.user?.manager?.name || "N/A",
        "Cadre": record.user?.cadre?.name || "N/A",
        "Check In Date": format(new Date(record.check_in), "dd-MM-yyyy"),
        "Check In Time": format(new Date(record.check_in), "HH:mm"),
        "Check Out Date": record.check_out ? format(new Date(record.check_out), "dd-MM-yyyy") : "Not Checked Out",
        "Check Out Time": record.check_out ? format(new Date(record.check_out), "HH:mm") : "Not Checked Out",
        "Duration (mins)": record.duration_minutes || "N/A",
        "Distance (km)": record.distance_traveled || "N/A",
        "Aadhar Number": aadharNumber,
        "Driving License": drivingLicense,
        "PAN Number": record.user?.pan_number || "N/A",
        "State": record.user?.state?.state_name || "N/A",
        "District": record.user?.district?.district_name || "N/A",
        "Mandal": record.user?.mandal?.mandal_name || "N/A",
        "Check In Meter Reading": record.check_in_meter_reading || "N/A",
        "Check Out Meter Reading": record.check_out_meter_reading || "N/A",
        "Check In Meter Image": record.check_in_meter_image || "N/A",
        "Check Out Meter Image": record.check_out_meter_image || "N/A"
      }
    })

    const csvContent = [
      headers.join(","),
      ...csvData.map(row => 
        Object.values(row).map(value => 
          String(value).includes(",") ? `"${String(value).replace(/"/g, '""')}"` : value
        ).join(",")
      )
    ].join("\n")

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `attendance_records_${format(fromDate, 'dd-MM-yyyy')}_to_${format(toDate, 'dd-MM-yyyy')}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportFarmerCollectionsToCSV = () => {
    const headers = [
      "Collection Date",
      "Collection Time",
      "Farmer Name",
      "Mobile Number",
      "Email",
      "Crop",
      "Company",
      "State",
      "District",
      "Mandal",
      "Village",
      "Social Media",
      "Collected By",
      "Collector Cadre"
    ]

    const csvData = farmerCollections.map(collection => ({
      "Collection Date": format(new Date(collection.created_at), "dd-MM-yyyy"),
      "Collection Time": format(new Date(collection.created_at), "HH:mm"),
      "Farmer Name": collection.name || "N/A",
      "Mobile Number": collection.mobile_number || "N/A",
      "Email": collection.email || "N/A",
      "Crop": collection.crop?.name || "N/A",
      "Company": collection.company?.name || "N/A",
      "State": collection.state?.state_name || "N/A",
      "District": collection.district?.district_name || "N/A",
      "Mandal": collection.mandal?.mandal_name || "N/A",
      "Village": collection.village?.name || "N/A",
      "Social Media": collection.social_media || "N/A",
      "Collected By": collection.collected_by?.name || "N/A",
      "Collector Cadre": collection.collected_by?.cadre?.name || "N/A"
    }))

    const csvContent = [
      headers.join(","),
      ...csvData.map(row => 
        Object.values(row).map(value => 
          String(value).includes(",") ? `"${String(value).replace(/"/g, '""')}"` : value
        ).join(",")
      )
    ].join("\n")

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `farmer_collections_${format(fromDate, 'dd-MM-yyyy')}_to_${format(toDate, 'dd-MM-yyyy')}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#228B22]">Reports</h1>
        <p className="text-[#6B8E23]">View and export attendance and farmer data reports</p>
      </div>

      <Card className="bg-[#F4A460] bg-opacity-20">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">From Date</label>
              <Input
                type="date"
                value={fromDate.toISOString().split('T')[0]}
                onChange={(e) => {
                  const date = new Date(e.target.value)
                  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
                  setFromDate(utcDate)
                }}
                className="bg-white"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">To Date</label>
              <Input
                type="date"
                value={toDate.toISOString().split('T')[0]}
                onChange={(e) => {
                  const date = new Date(e.target.value)
                  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999))
                  setToDate(utcDate)
                }}
                className="bg-white"
              />
            </div>
            {activeTab === "attendance" && (
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">User Type</label>
                <Select value={userType} onValueChange={(value) => setUserType(value as "all" | "employee" | "manager")}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select user type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="attendance" className="space-y-4" onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="attendance">Attendance Records</TabsTrigger>
          <TabsTrigger value="collections">Farmer Collections</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance">
          <Card>
            <CardContent className="p-4">
              <div className="flex justify-end mb-4">
                <Button 
                  onClick={exportAttendanceToCSV}
                  className="bg-[#228B22] hover:bg-[#1a6b1a] text-white"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Employee Name</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Email</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Phone</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Role</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Manager</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Cadre</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Check In Date</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Check In Time</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Check Out Date</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Check Out Time</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Duration (mins)</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Distance (km)</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Aadhar Number</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Driving License</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">PAN Number</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">State</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">District</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Mandal</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Check In Meter Reading</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Check Out Meter Reading</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Check In Meter Image</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Check Out Meter Image</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendanceRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="text-xs md:text-sm">{record.user?.name || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.user?.email || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.user?.phone || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.user?.role || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.user?.manager?.name || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.user?.cadre?.name || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{format(new Date(record.check_in), "dd-MM-yyyy")}</TableCell>
                        <TableCell className="text-xs md:text-sm">{format(new Date(record.check_in), "HH:mm")}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.check_out ? format(new Date(record.check_out), "dd-MM-yyyy") : "Not Checked Out"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.check_out ? format(new Date(record.check_out), "HH:mm") : "Not Checked Out"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.duration_minutes || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.distance_traveled || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.user?.aadhar_number || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.user?.driving_license || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.user?.pan_number || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.user?.state?.state_name || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.user?.district?.district_name || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.user?.mandal?.mandal_name || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.check_in_meter_reading || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{record.check_out_meter_reading || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">
                          {record.check_in_meter_image ? (
                            <a href={record.check_in_meter_image} target="_blank" rel="noopener noreferrer" className="text-[#228B22] hover:underline">
                              View Image
                            </a>
                          ) : "N/A"}
                        </TableCell>
                        <TableCell className="text-xs md:text-sm">
                          {record.check_out_meter_image ? (
                            <a href={record.check_out_meter_image} target="_blank" rel="noopener noreferrer" className="text-[#228B22] hover:underline">
                              View Image
                            </a>
                          ) : "N/A"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collections">
          <Card>
            <CardContent className="p-4">
              <div className="flex justify-end mb-4">
                <Button 
                  onClick={exportFarmerCollectionsToCSV}
                  className="bg-[#228B22] hover:bg-[#1a6b1a] text-white"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Collection Date</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Collection Time</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Farmer Name</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Mobile Number</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Email</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Crop</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Company</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">State</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">District</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Mandal</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Village</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Social Media</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Collected By</TableHead>
                      <TableHead className="whitespace-nowrap text-xs md:text-sm font-medium">Collector Cadre</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {farmerCollections.map((collection) => (
                      <TableRow key={collection.id}>
                        <TableCell className="text-xs md:text-sm">{format(new Date(collection.created_at), "dd-MM-yyyy")}</TableCell>
                        <TableCell className="text-xs md:text-sm">{format(new Date(collection.created_at), "HH:mm")}</TableCell>
                        <TableCell className="text-xs md:text-sm">{collection.name || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{collection.mobile_number || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{collection.email || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{collection.crop?.name || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{collection.company?.name || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{collection.state?.state_name || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{collection.district?.district_name || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{collection.mandal?.mandal_name || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{collection.village?.name || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{collection.social_media || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{collection.collected_by?.name || "N/A"}</TableCell>
                        <TableCell className="text-xs md:text-sm">{collection.collected_by?.cadre?.name || "N/A"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 