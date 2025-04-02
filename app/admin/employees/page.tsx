"use client"

import { useState, useEffect } from "react";
import dynamic from 'next/dynamic';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"
import { Search, MapPin, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, History } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/contexts/auth-context";
import { supabase, fetchLatestEmployeeLocation } from "@/lib/supabaseClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmployeeDetailsPopup from "@/components/EmployeeDetailsPopup";

// Dynamically load components that use browser APIs
const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });
const EmployeeDataPopup = dynamic(() => import('@/components/EmployeeDataPopup'), { ssr: false });

interface Employee {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  location?: string;
  avatar?: string;
  status: 'checked-in' | 'checked-out';
  lastCheckTime: string | null;
  cadre?: { name: string };
  manager?: { name: string };
  currentLogId?: string | null;
  locationUpdatedAt?: string | null;
  lastLogId?: string | null;
  aadhar_number?: string;
  pan_number?: string;
  driving_license?: string;
  address?: string;
  state?: string;
  district?: string;
  mandal?: string;
  village?: string;
}

// Create a client-only wrapper
const AdminEmployeeList = () => {
  const [searchQuery, setSearchQuery] = useState("")
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([])
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchEmployees();

    // Add visibility change listener to refresh data when tab becomes active
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Page became visible, refreshing employee data');
        fetchEmployees();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  const fetchEmployees = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Base query to get employee data
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          manager:manager_id(name),
          cadre(name),
          attendance_logs(id, check_in, check_out)
        `)
        .eq("role", "employee")
        .eq("status", "approved");

      if (error) {
        console.error("Error fetching employees:", error);
        return;
      }

      // Debug the first employee to check fields
      if (data && data.length > 0) {
        console.log("DEBUG - First employee full data:", JSON.stringify(data[0], null, 2));
        console.log("DEBUG - Available fields:", Object.keys(data[0]).join(", "));
      }

      interface AttendanceLog {
        id: string;
        check_in: string;
        check_out: string | null;
      }

      const employeesWithStatus = await Promise.all(data.map(async employee => {
        const latestLog = employee.attendance_logs?.sort((a: AttendanceLog, b: AttendanceLog) => 
          new Date(b.check_in).getTime() - new Date(a.check_in).getTime()
        )[0];
        
        let locationStr = employee.location || '';
        let locationUpdatedAt = null;
        
        // Fetch latest location data for ALL employees
        try {
          const latestLocation = await fetchLatestEmployeeLocation(employee.id);
          if (latestLocation) {
            // Check if the location is from today
            const locationDate = new Date(latestLocation.captured_at);
            const today = new Date();
            const isToday = locationDate.getDate() === today.getDate() &&
                          locationDate.getMonth() === today.getMonth() &&
                          locationDate.getFullYear() === today.getFullYear();

            if (isToday) {
              locationStr = `${latestLocation.latitude},${latestLocation.longitude}`;
              locationUpdatedAt = new Date(latestLocation.captured_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
              });
            } else {
              locationStr = "";
              locationUpdatedAt = null;
            }
          }
        } catch (e) {
          console.error(`Error fetching location for employee ${employee.id}:`, e);
        }
        
        // Fetch state, district, mandal, and village names
        let stateName = '';
        let districtName = '';
        let mandalName = '';
        let villageName = '';
        
        // Fetch state name
        if (employee.state) {
          try {
            const { data: stateData, error: stateError } = await supabase
              .from('states')
              .select('state_name')
              .eq('id', employee.state)
              .single();
              
            if (!stateError && stateData) {
              stateName = stateData.state_name;
              console.log(`DEBUG - Found state name for ${employee.name}: ${stateName}`);
            } else if (stateError) {
              console.error(`Error fetching state for employee ${employee.id}:`, stateError);
            }
          } catch (e) {
            console.error(`Error fetching state for employee ${employee.id}:`, e);
          }
        }
        
        // Fetch district name
        if (employee.district) {
          try {
            const { data: districtData, error: districtError } = await supabase
              .from('districts')
              .select('district_name')
              .eq('id', employee.district)
              .single();
              
            if (!districtError && districtData) {
              districtName = districtData.district_name;
              console.log(`DEBUG - Found district name for ${employee.name}: ${districtName}`);
            } else if (districtError) {
              console.error(`Error fetching district for employee ${employee.id}:`, districtError);
            }
          } catch (e) {
            console.error(`Error fetching district for employee ${employee.id}:`, e);
          }
        }
        
        // Fetch mandal name
        if (employee.mandal) {
          try {
            const { data: mandalData, error: mandalError } = await supabase
              .from('mandals')
              .select('mandal_name')
              .eq('id', employee.mandal)
              .single();
              
            if (!mandalError && mandalData) {
              mandalName = mandalData.mandal_name;
              console.log(`DEBUG - Found mandal name for ${employee.name}: ${mandalName}`);
            } else if (mandalError) {
              console.error(`Error fetching mandal for employee ${employee.id}:`, mandalError);
            }
          } catch (e) {
            console.error(`Error fetching mandal for employee ${employee.id}:`, e);
          }
        }
        
        // Fetch village name
        if (employee.village) {
          try {
            const { data: villageData, error: villageError } = await supabase
              .from('villages')
              .select('name')
              .eq('id', employee.village)
              .single();
              
            if (!villageError && villageData) {
              villageName = villageData.name;
              console.log(`DEBUG - Found village name for ${employee.name}: ${villageName}`);
            } else if (villageError) {
              console.error(`Error fetching village for employee ${employee.id}:`, villageError);
            }
          } catch (e) {
            console.error(`Error fetching village for employee ${employee.id}:`, e);
          }
        }
        
        console.log(`DEBUG - Employee ${employee.name} (${employee.id}) raw data:`, {
          aadhar_number: employee.aadhar_number,
          pan_number: employee.pan_number,
          driving_license: employee.driving_license,
          address: employee.address,
          state: employee.state,
          district: employee.district,
          mandal: employee.mandal,
          village: employee.village,
          email: employee.email,
          phone: employee.phone,
        });
        
        const lastAttendanceLogId = latestLog?.id || null;
        
        return {
          ...employee,
          status: latestLog ? (latestLog.check_out ? "checked-out" : "checked-in") : "checked-out",
          lastCheckTime: latestLog?.check_in ? new Date(latestLog.check_in).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
          }) : null,
          currentLogId: latestLog && !latestLog.check_out ? latestLog.id : null,
          lastLogId: lastAttendanceLogId,
          location: locationStr ? locationStr : "",
          locationUpdatedAt,
          // Ensure all required fields are available for EmployeeDetailsPopup
          email: employee.email || "",
          phone: employee.phone || "",
          manager: { name: employee.manager?.name || "" },
          aadhar_number: employee.aadhar_number || "",
          pan_number: employee.pan_number || "",
          driving_license: employee.driving_license || "",
          address: employee.address || "",
          // Use the resolved location names instead of UUIDs
          state: stateName || "Unknown",
          district: districtName || "Unknown", 
          mandal: mandalName || "Unknown",
          village: villageName || "Unknown"
        };
      }));

      setEmployees(employeesWithStatus);
    } catch (error) {
      console.error("Failed to fetch employees", error);
    } finally {
      setIsLoading(false);
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .substring(0, 2)
  }

  const handleExpandClick = (employeeId: string) => {
    setExpandedEmployeeId(expandedEmployeeId === employeeId ? null : employeeId);
  };

  // Filter employees based on search query
  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (employee.cadre?.name && employee.cadre.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#228B22]">Employee Management</h1>
          <p className="text-sm text-[#6B8E23]">Showing approved employees only</p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchEmployees} 
            disabled={isLoading}
            className="flex items-center gap-1"
          >
            {isLoading ? (
              <>
                <div className="animate-spin h-4 w-4 border-b-2 border-[#228B22] rounded-full"></div>
                <span>Refreshing...</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                <span>Refresh</span>
              </>
            )}
          </Button>
        </div>
      </div>

      <Card className="bg-[#F4A460] bg-opacity-20">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#6B8E23]" />
              <Input
                placeholder="Search employees by name or cadre..."
                className="pl-10 bg-white"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {filteredEmployees.length > 0 ? (
          filteredEmployees.map((employee) => (
            <Card key={employee.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-10 w-10 border border-[#F4A460]">
                    <AvatarImage src={employee.avatar || ""} alt={employee.name} />
                    <AvatarFallback className="bg-[#F4A460] text-white">
                      {getInitials(employee.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="font-medium">{employee.name}</div>
                    <div className="text-sm text-[#6B8E23]">
                      {employee.cadre?.name || "Staff"}
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-4">
                    <div className="text-sm flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[#6B8E23]" />
                      {employee.location ? (
                        <span>Location available</span>
                      ) : (
                        <span>No location data</span>
                      )}
                      {employee.locationUpdatedAt && (
                        <span className="text-xs text-[#6B8E23]">({employee.locationUpdatedAt})</span>
                      )}
                    </div>

                    <button
                      onClick={() => handleExpandClick(employee.id)}
                      className="p-0"
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform text-[#6B8E23] ${
                          expandedEmployeeId === employee.id ? "rotate-180 text-[#D3D3D3]" : ""
                        }`}
                      />
                    </button>

                    <div className="flex items-center gap-2">
                      {employee.status === "checked-in" ? (
                        <Badge className="bg-[#FFD700] text-[#333333] flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Checked In
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[#D3D3D3] flex items-center gap-1">
                          <XCircle className="h-3 w-3" />
                          Checked Out
                        </Badge>
                      )}
                      <span className="text-xs text-[#D3D3D3] flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {employee.lastCheckTime}
                      </span>
                    </div>

                    <EmployeeDetailsPopup employee={employee} />
                  </div>
                </div>

                <div className="md:hidden mt-2 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {employee.status === "checked-in" ? (
                      <Badge className="bg-[#FFD700] text-[#333333] flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Checked In
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[#D3D3D3] flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        Checked Out
                      </Badge>
                    )}
                    <span className="text-xs text-[#D3D3D3] flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {employee.lastCheckTime}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleExpandClick(employee.id)}
                      className="p-0"
                    >
                      <ChevronDown
                        className={`h-3 w-3 transition-transform text-[#6B8E23] ${
                          expandedEmployeeId === employee.id ? "rotate-180 text-[#D3D3D3]" : ""
                        }`}
                      />
                    </button>
                    <EmployeeDetailsPopup employee={employee} />
                  </div>
                </div>
                {expandedEmployeeId === employee.id && (
                  <div className="mt-4">
                    <div className="relative">
                      <div 
                        className="w-full bg-gray-100 rounded-lg overflow-hidden" 
                        style={{ height: "350px" }}
                        data-map-container={employee.id}
                      >
                        {(employee.currentLogId || employee.lastLogId) ? (
                          // If we have a log ID, show the movement path which includes current location
                          <LeafletMap
                            key={`map-${employee.id}-${employee.currentLogId || employee.lastLogId}-${Date.now()}`}
                            employeeId={employee.id}
                            showPath={true}
                            attendanceLogId={(employee.currentLogId || employee.lastLogId) as string}
                            containerType="movement-path"
                          />
                        ) : (
                          // Otherwise fall back to just current location
                          <LeafletMap
                            key={`map-${employee.id}-${Date.now()}`}
                            employeeId={employee.id}
                            location={employee.location}
                            showPath={false}
                            containerType="current-location"
                          />
                        )}
                      </div>
                      <div className="mt-2 bg-[#F4FAF4] p-3 rounded-lg">
                        <div className="flex justify-between items-center">
                          <div className="text-sm font-medium">{employee.name}</div>
                          {(employee.currentLogId || employee.lastLogId) && (
                            <div className="flex items-center text-sm text-[#228B22]">
                              <History className="h-3 w-3 mr-1" />
                              <span>Movement Path Shown</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="text-sm text-[#6B8E23] flex items-center gap-2 mt-1">
                          <MapPin className="h-4 w-4" />
                          {employee.locationUpdatedAt ? (
                            <span className="font-medium">Location updated at {employee.locationUpdatedAt}</span>
                          ) : (
                            <span>No recent location data available</span>
                          )}
                        </div>
                        
                        {(employee.currentLogId || employee.lastLogId) && (
                          <div className="text-sm text-[#6B8E23] mt-1">
                            {employee.status === "checked-in" ? (
                              <span>Showing path since check-in at {employee.lastCheckTime}</span>
                            ) : (
                              <span>Showing path from last activity at {employee.lastCheckTime}</span>
                            )}
                          </div>
                        )}
                        
                        {!employee.location && (
                          <div className="mt-2 text-xs text-amber-600">
                            {(employee.currentLogId || employee.lastLogId) ? 
                              "No movement data available for this attendance period." :
                              "This employee has no location records. Location tracking begins when an employee checks in."}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-[#6B8E23]">No employees found matching your search criteria.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// Create a wrapper component that only renders on the client
const AdminEmployeeListPage = () => {
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  if (!isMounted) {
    return <div className="p-8 flex justify-center">Loading employee data...</div>;
  }
  
  return <AdminEmployeeList />;
};

export default dynamic(() => Promise.resolve(AdminEmployeeListPage), { ssr: false });
