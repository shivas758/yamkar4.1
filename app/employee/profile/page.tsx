"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { User, Mail, Phone, MapPin, Building, Users, Camera, Loader2, X } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabaseClient"
import AvatarUploadPopup from "@/components/AvatarUploadPopup"

export default function EmployeeProfilePage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [showAvatarUploadPopup, setShowAvatarUploadPopup] = useState(false)
  const [showFullScreenPreview, setShowFullScreenPreview] = useState(false)
  
  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    phone: "",
    employeeId: "",
    department: "",
    location: "",
    role: "employee",
    joinDate: "",
    manager: "",
  })

  const [editForm, setEditForm] = useState({ ...profileData })

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) return;
      
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
          
        if (error) throw error;
        
        if (data) {
          // Set profile data
          setProfileData({
            name: data.name || "",
            email: data.email || "",
            phone: data.phone || data.phone_number || "",
            employeeId: data.employee_id || data.employeeId || "",
            department: data.department || "",
            location: data.location || "",
            role: "employee",
            joinDate: data.created_at ? new Date(data.created_at).toLocaleDateString() : "",
            manager: data.manager || "",
          });
          
          setEditForm({
            name: data.name || "",
            email: data.email || "",
            phone: data.phone || data.phone_number || "",
            employeeId: data.employee_id || data.employeeId || "",
            department: data.department || "",
            location: data.location || "",
            role: "employee",
            joinDate: data.created_at ? new Date(data.created_at).toLocaleDateString() : "",
            manager: data.manager || "",
          });
          
          // Look for avatar URL
          const possibleAvatarFields = ['avatar_url', 'avatarUrl', 'avatar', 'profile_picture', 'profilePicture', 'photo'];
          for (const field of possibleAvatarFields) {
            if (data[field]) {
              setAvatarUrl(data[field]);
              break;
            }
          }
        }
      } catch (error: any) {
        console.error("Error fetching profile:", error);
        toast({
          title: "Error",
          description: "Failed to load profile data",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUserProfile();
  }, [user, toast]);

  const handleSave = async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      
      const { error } = await supabase
        .from('users')
        .update({
          name: editForm.name,
        })
        .eq('id', user.id);
        
      if (error) throw error;
      
      setProfileData({
        ...profileData,
        name: editForm.name
      });
      setIsEditing(false);
      
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
        duration: 3000,
      });
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarUpdate = (url: string | null) => {
    setAvatarUrl(url);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  if (isLoading && !profileData.name) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-[#228B22]" />
          <p className="text-[#228B22]">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 className="text-2xl font-bold text-[#F4A460]">My Profile</h1>
          
          {/* Edit button for desktop view only */}
          <div className="hidden md:block">
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)} className="bg-[#F4A460] hover:bg-[#E3935D]">Edit Profile</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={isLoading} className="bg-[#F4A460] hover:bg-[#E3935D]">
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Profile Card */}
          <Card className="md:col-span-1">
            <CardContent className="pt-6 flex flex-col items-center">
              <div className="relative">
                <Avatar 
                  className="h-32 w-32 mb-4 cursor-pointer" 
                  onClick={() => avatarUrl && setShowFullScreenPreview(true)}
                >
                  {avatarUrl ? (
                    <AvatarImage src={avatarUrl} alt={profileData.name} />
                  ) : (
                    <AvatarFallback className="bg-[#F4A460] text-white text-2xl">
                      {getInitials(profileData.name)}
                    </AvatarFallback>
                  )}
                </Avatar>
              </div>
              
              <h2 className="text-xl font-semibold">{profileData.name}</h2>
              <Badge className="mt-1 bg-[#F4A460] text-white">{profileData.role}</Badge>
              
              <div className="w-full mt-6 space-y-4">
                <div className="flex items-center">
                  <Mail className="h-5 w-5 mr-2 text-[#6B8E23]" />
                  <span className="text-sm">{profileData.email}</span>
                </div>
                
                <div className="flex items-center">
                  <Phone className="h-5 w-5 mr-2 text-[#6B8E23]" />
                  <span className="text-sm">{profileData.phone || "Not provided"}</span>
                </div>
                
                <div className="flex items-center">
                  <Building className="h-5 w-5 mr-2 text-[#6B8E23]" />
                  <span className="text-sm">{profileData.department || "Not assigned"}</span>
                </div>
                
                <div className="flex items-center">
                  <MapPin className="h-5 w-5 mr-2 text-[#6B8E23]" />
                  <span className="text-sm">{profileData.location || "Not specified"}</span>
                </div>
                
                <div className="flex items-center">
                  <Users className="h-5 w-5 mr-2 text-[#6B8E23]" />
                  <span className="text-sm">Manager: {profileData.manager || "Not assigned"}</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="mt-6 w-full flex items-center justify-center bg-[#f8f8f8] hover:bg-[#efefef] border-[#e0e0e0]"
                onClick={() => setShowAvatarUploadPopup(true)}
              >
                <Camera className="mr-2 h-4 w-4 text-[#F4A460]" />
                <span className="text-[#F4A460] font-medium">Change Profile Picture</span>
              </Button>
            </CardContent>
          </Card>
          
          {/* Edit Profile Card */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your personal information and contact details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                {isEditing ? (
                  <Input
                    id="name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                ) : (
                  <div className="p-2 border rounded-md bg-gray-50">{profileData.name}</div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="p-2 border rounded-md bg-gray-50">{profileData.email}</div>
                <p className="text-xs text-muted-foreground">Email address cannot be changed</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="p-2 border rounded-md bg-gray-50">{profileData.phone || "Not provided"}</div>
                <p className="text-xs text-muted-foreground">Phone number cannot be changed</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                {isEditing ? (
                  <Input
                    id="location"
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  />
                ) : (
                  <div className="p-2 border rounded-md bg-gray-50">{profileData.location || "Not specified"}</div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <div className="p-2 border rounded-md bg-gray-50">{profileData.department || "Not assigned"}</div>
                <p className="text-xs text-muted-foreground">Department is managed by administrators</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="manager">Manager</Label>
                <div className="p-2 border rounded-md bg-gray-50">{profileData.manager || "Not assigned"}</div>
                <p className="text-xs text-muted-foreground">Manager is assigned by administrators</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Edit buttons for mobile view - positioned at the bottom */}
        <div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t md:hidden">
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} className="w-full bg-[#F4A460] hover:bg-[#E3935D]">Edit Profile</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsEditing(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleSave} disabled={isLoading} className="flex-1 bg-[#F4A460] hover:bg-[#E3935D]">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Add bottom padding for mobile view to account for the fixed button */}
        <div className="pb-20 md:pb-0"></div>

        {/* Avatar Upload Popup */}
        {user && (
          <AvatarUploadPopup
            isOpen={showAvatarUploadPopup}
            onClose={() => setShowAvatarUploadPopup(false)}
            currentAvatar={avatarUrl}
            userId={user.id}
            userName={profileData.name}
            onAvatarUpdate={handleAvatarUpdate}
          />
        )}
      </div>

      {/* Full Screen Avatar Preview */}
      {showFullScreenPreview && avatarUrl && (
        <div 
          className="fixed inset-0 z-[100] bg-black bg-opacity-90 flex items-center justify-center p-4"
          onClick={() => setShowFullScreenPreview(false)}
        >
          <div 
            className="relative max-w-4xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <Button 
              variant="secondary" 
              size="icon" 
              className="absolute top-4 right-4 bg-gray-800 text-white hover:bg-gray-700 z-10 rounded-full shadow-md"
              onClick={(e) => {
                e.stopPropagation();
                setShowFullScreenPreview(false);
              }}
            >
              <X className="h-6 w-6" />
            </Button>
            <img 
              src={avatarUrl} 
              alt="Profile Picture"
              className="max-h-[90vh] max-w-full h-auto w-auto mx-auto object-contain rounded-md"
            />
          </div>
        </div>
      )}
    </>
  )
}

