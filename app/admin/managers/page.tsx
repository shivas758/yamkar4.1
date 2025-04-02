"use client";

import type React from "react";
import { supabase, fetchLatestEmployeeLocation } from "@/lib/supabaseClient";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Search, Mail, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, History, MapPin } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import dynamic from 'next/dynamic';
import ManagerDetailsPopup from "@/components/ManagerDetailsPopup";

// Dynamically load components that use browser APIs
const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });

export default function ManagerManagementPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [managers, setManagers] = useState<any[]>([]);
  const [expandedManagerId, setExpandedManagerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchManagers();
  }, []);

  const fetchManagers = async () => {
    try {
      setIsLoading(true);

      // Fetch managers
      const { data: managerData, error: managerError } = await supabase
      .from('users')
        .select(`
          *,
          attendance_logs(id, check_in, check_out)
        `)
        .eq('role', 'manager')
        .eq('status', 'approved');

      if (managerError) {
        console.error("Error fetching managers:", managerError);
      return;
    }

      interface AttendanceLog {
        id: string;
        check_in: string;
        check_out: string | null;
      }

      // Get employee counts and additional data for each manager
      const managersWithDetails = await Promise.all(managerData.map(async (manager) => {
        // Get check-in status from attendance logs
        const latestLog = manager.attendance_logs?.sort((a: AttendanceLog, b: AttendanceLog) => 
          new Date(b.check_in).getTime() - new Date(a.check_in).getTime()
        )[0];

        let locationStr = manager.location || '';
        let locationUpdatedAt = null;
        
        // Fetch latest location data for managers
        try {
          const latestLocation = await fetchLatestEmployeeLocation(manager.id);
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
          console.error(`Error fetching location for manager ${manager.id}:`, e);
        }

        // Fetch state, district, mandal, and village names if location IDs exist
        let stateName = '';
        let districtName = '';
        let mandalName = '';
        let villageName = '';
        
        // Fetch state name
        if (manager.state) {
          try {
            const { data: stateData, error: stateError } = await supabase
              .from('states')
              .select('state_name')
              .eq('id', manager.state)
              .single();
              
            if (!stateError && stateData) {
              stateName = stateData.state_name;
            }
          } catch (e) {
            console.error(`Error fetching state for manager ${manager.id}:`, e);
          }
        }
        
        // Fetch district name
        if (manager.district) {
          try {
            const { data: districtData, error: districtError } = await supabase
              .from('districts')
              .select('district_name')
              .eq('id', manager.district)
              .single();
              
            if (!districtError && districtData) {
              districtName = districtData.district_name;
            }
          } catch (e) {
            console.error(`Error fetching district for manager ${manager.id}:`, e);
          }
        }
        
        // Fetch mandal name
        if (manager.mandal) {
          try {
            const { data: mandalData, error: mandalError } = await supabase
              .from('mandals')
              .select('mandal_name')
              .eq('id', manager.mandal)
              .single();
              
            if (!mandalError && mandalData) {
              mandalName = mandalData.mandal_name;
            }
          } catch (e) {
            console.error(`Error fetching mandal for manager ${manager.id}:`, e);
          }
        }
        
        // Fetch village name
        if (manager.village) {
          try {
            const { data: villageData, error: villageError } = await supabase
              .from('villages')
              .select('name')
              .eq('id', manager.village)
              .single();
              
            if (!villageError && villageData) {
              villageName = villageData.name;
            }
          } catch (e) {
            console.error(`Error fetching village for manager ${manager.id}:`, e);
          }
        }

        // Get employee count but don't display it
        const { count, error: countError } = await supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'employee')
          .eq('manager_id', manager.id);

        if (countError) {
          console.error(`Error counting employees for manager ${manager.id}:`, countError);
        }

        const lastAttendanceLogId = latestLog?.id || null;

        return {
          ...manager,
          employeeCount: count || 0, // Still fetch this but we won't display it in the list view
          status: latestLog ? (latestLog.check_out ? "checked-out" : "checked-in") : "checked-out",
          lastCheckTime: latestLog?.check_in ? new Date(latestLog.check_in).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
          }) : null,
          currentLogId: latestLog && !latestLog.check_out ? latestLog.id : null,
          lastLogId: lastAttendanceLogId,
          location: locationStr,
          locationUpdatedAt,
          // Use the resolved location names instead of UUIDs
          state: stateName || "Unknown",
          district: districtName || "Unknown", 
          mandal: mandalName || "Unknown",
          village: villageName || "Unknown"
        };
      }));

      setManagers(managersWithDetails);
    } catch (error) {
      console.error("Failed to fetch managers", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const handleExpandClick = (managerId: string) => {
    setExpandedManagerId(expandedManagerId === managerId ? null : managerId);
  };

  const filteredManagers = managers.filter((manager: any) => {
    return manager.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      manager.email.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
        <h1 className="text-2xl font-bold text-[#228B22]">Manager Management</h1>
          <p className="text-sm text-[#6B8E23]">Showing approved managers only</p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchManagers} 
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

      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#6B8E23]" />
          <Input
            placeholder="Search managers..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
        {filteredManagers.length > 0 ? (
          filteredManagers.map((manager: any) => (
            <Card key={manager.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-10 w-10 border border-[#F4A460]">
                      <AvatarImage src={manager.avatar} alt={manager.name} />
                      <AvatarFallback className="bg-[#6B8E23] text-white">{getInitials(manager.name)}</AvatarFallback>
                    </Avatar>
                  <div className="flex-1">
                      <div className="font-medium">{manager.name}</div>
                      <div className="text-sm text-[#6B8E23] flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {manager.email}
                      </div>
                    </div>

                  <div className="hidden md:flex items-center gap-4">
                    <div className="text-sm flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[#6B8E23]" />
                      {manager.location ? (
                        <span>Location available</span>
                      ) : (
                        <span>No location data</span>
                      )}
                      {manager.locationUpdatedAt && (
                        <span className="text-xs text-[#6B8E23]">({manager.locationUpdatedAt})</span>
                      )}
                    </div>

                    <button
                      onClick={() => handleExpandClick(manager.id)}
                      className="p-0"
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform text-[#6B8E23] ${
                          expandedManagerId === manager.id ? "rotate-180 text-[#D3D3D3]" : ""
                        }`}
                      />
                    </button>

                    <div className="flex items-center gap-2">
                      {manager.status === "checked-in" ? (
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
                        {manager.lastCheckTime}
                      </span>
                    </div>

                    <ManagerDetailsPopup manager={manager} />
                  </div>
                  </div>

                <div className="md:hidden mt-2 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {manager.status === "checked-in" ? (
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
                      {manager.lastCheckTime}
                          </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleExpandClick(manager.id)}
                      className="p-0"
                    >
                      <ChevronDown
                        className={`h-3 w-3 transition-transform text-[#6B8E23] ${
                          expandedManagerId === manager.id ? "rotate-180 text-[#D3D3D3]" : ""
                        }`}
                      />
                    </button>
                    <ManagerDetailsPopup manager={manager} />
                  </div>
                </div>

                {expandedManagerId === manager.id && (
                  <div className="mt-4">
                    <div className="relative">
                      <div 
                        className="w-full bg-gray-100 rounded-lg overflow-hidden" 
                        style={{ height: "350px" }}
                        data-map-container={manager.id}
                      >
                        {(manager.currentLogId || manager.lastLogId) ? (
                          // If we have a log ID, show the movement path which includes current location
                          <LeafletMap
                            key={`map-${manager.id}-${manager.currentLogId || manager.lastLogId}-${Date.now()}`}
                            employeeId={manager.id}
                            showPath={true}
                            attendanceLogId={(manager.currentLogId || manager.lastLogId) as string}
                            containerType="movement-path"
                          />
                        ) : (
                          // Otherwise fall back to just current location
                          <LeafletMap
                            key={`map-${manager.id}-${Date.now()}`}
                            employeeId={manager.id}
                            location={manager.location}
                            showPath={false}
                            containerType="current-location"
                          />
                        )}
                      </div>
                      <div className="mt-2 bg-[#F4FAF4] p-3 rounded-lg">
                        <div className="flex justify-between items-center">
                          <div className="text-sm font-medium">{manager.name}</div>
                          {(manager.currentLogId || manager.lastLogId) && (
                            <div className="flex items-center text-sm text-[#228B22]">
                              <History className="h-3 w-3 mr-1" />
                              <span>Movement Path Shown</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="text-sm text-[#6B8E23] flex items-center gap-2 mt-1">
                          <MapPin className="h-4 w-4" />
                          {manager.locationUpdatedAt ? (
                            <span className="font-medium">Location updated at {manager.locationUpdatedAt}</span>
                          ) : (
                            <span>No recent location data available</span>
                          )}
                        </div>
                        
                        {(manager.currentLogId || manager.lastLogId) && (
                          <div className="text-sm text-[#6B8E23] mt-1">
                            {manager.status === "checked-in" ? (
                              <span>Showing path since check-in at {manager.lastCheckTime}</span>
                            ) : (
                              <span>Showing path from last activity at {manager.lastCheckTime}</span>
                            )}
                          </div>
                        )}
                        
                        {!manager.location && (
                          <div className="mt-2 text-xs text-amber-600">
                            {(manager.currentLogId || manager.lastLogId) ? 
                              "No movement data available for this attendance period." :
                              "This manager has no location records. Location tracking begins when a manager checks in."}
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
          <div className="text-center p-8">
            <div className="text-[#D3D3D3] mb-2">No managers found</div>
            <div className="text-sm">Try adjusting your search criteria</div>
          </div>
        )}
      </div>
    </div>
  );
}
