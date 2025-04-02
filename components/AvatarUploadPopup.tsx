import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Upload, AlertCircle, Camera as CameraIconLucide, Image as ImageIcon, Trash, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import imageCompression from "browser-image-compression";
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource, PermissionStatus } from '@capacitor/camera';

interface AvatarUploadPopupProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatar?: string | null;
  userId: string;
  userName: string;
  onAvatarUpdate: (url: string | null) => void;
}

const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
};

// Helper to convert Data URL to Blob
function dataURLtoBlob(dataurl: string) {
    const arr = dataurl.split(',');
    if (arr.length < 2) return null;
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) return null;
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}

const AvatarUploadPopup: React.FC<AvatarUploadPopupProps> = ({
  isOpen,
  onClose,
  currentAvatar,
  userId,
  userName,
  onAvatarUpdate,
}) => {
  const { toast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(currentAvatar || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("upload");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasCheckedCameraSupport, setHasCheckedCameraSupport] = useState(false);
  const [hasCameraSupportState, setHasCameraSupportState] = useState(false);

  const isNative = Capacitor.isNativePlatform();

  // Function to check camera support (runs once)
  const checkCameraSupport = async () => {
    if (hasCheckedCameraSupport) return hasCameraSupportState;

    let supported = false;
    if (isNative) {
      supported = Capacitor.isPluginAvailable('Camera');
    } else {
      supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }
    setHasCameraSupportState(supported);
    setHasCheckedCameraSupport(true);
    return supported;
  };

  // Run check on mount or when isOpen changes
  useEffect(() => {
    if (isOpen) {
      checkCameraSupport();
      // Reset state when opening
      setImageFile(null);
      setImagePreview(currentAvatar || null);
      setError(null);
      setIsSubmitting(false);
      setActiveTab("upload"); // Always default to upload when opening
    } else {
      // Cleanup when closing
      stopWebCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentAvatar]); // Add currentAvatar to dependencies

  // --- Native Camera Logic ---
  const takeNativePhoto = async () => {
    setError(null);
    setIsSubmitting(true); // Use submitting state for loading indicator

    try {
        // 1. Check & Request Permissions
        let permissionStatus: PermissionStatus = await Camera.checkPermissions();
        if (permissionStatus.camera !== 'granted') {
            permissionStatus = await Camera.requestPermissions({ permissions: ['camera'] });
        }

        if (permissionStatus.camera !== 'granted') {
            setError("Camera permission denied. Please grant access in settings.");
            toast({ title: "Permission Denied", description: "Camera access is required to take a photo.", variant: "destructive" });
            setIsSubmitting(false);
            return;
        }

        // 2. Take Photo
        const image = await Camera.getPhoto({
            quality: 90,
            allowEditing: true, // Let user crop/adjust
            resultType: CameraResultType.DataUrl, // Get Data URL for easy preview & conversion
            source: CameraSource.Camera, // Use the camera
            saveToGallery: false // Don't save to gallery by default for profile pics
        });

        if (image.dataUrl) {
            // 3. Process Image
            setImagePreview(image.dataUrl); // Show preview immediately

            const blob = dataURLtoBlob(image.dataUrl);
            if (!blob) {
              throw new Error("Could not convert photo data to Blob.");
            }

            const timestamp = new Date().getTime();
            const newFile = new File([blob], `profile-photo-${timestamp}.jpg`, { type: 'image/jpeg' });

            // 4. Compress (Optional but recommended)
            const compressedFile = await compressImage(newFile);
            setImageFile(compressedFile);
            setImagePreview(URL.createObjectURL(compressedFile)); // Update preview with compressed version if different

            // 5. Submit (or let user confirm) - using existing handleSubmit
             await handleSubmit(compressedFile); // Auto-submit after taking photo

        } else {
             setError("Failed to get photo data. Please try again.");
        }

    } catch (err: any) {
        console.error("Error taking native photo:", err);
        if (err.message && err.message.toLowerCase().includes('cancelled')) {
            setError("Photo capture cancelled.");
        } else if (err.message && err.message.toLowerCase().includes('permission')) {
             setError("Camera permission denied.");
        }
        else {
            setError(`Error taking photo: ${err.message || "Unknown error"}`);
        }
    } finally {
         setIsSubmitting(false);
    }
};


  // --- Web Camera Logic (Fallback) ---
  const stopWebCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  };

  const startWebCamera = async () => {
     if (isNative) return; // Should not be called on native
    try {
      stopWebCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 }, // Smaller resolution for web preview
          height: { ideal: 480 }
        },
        audio: false
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setError(null);
    } catch (err: any) {
      console.error("Error accessing web camera:", err);
      setError(`Web camera access error: ${err.message}. Try image upload?`);
      setActiveTab("upload");
    }
  };

  const captureWebPhoto = () => {
     if (isNative || !videoRef.current || !cameraStream) {
        setError("Web camera not available.");
        return;
     }

    try {
      const canvas = document.createElement('canvas');
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setError("Failed to capture web image.");
          return;
        }
        const timestamp = new Date().getTime();
        const newFile = new File([blob], `profile-photo-${timestamp}.jpg`, { type: 'image/jpeg' });

        try {
          const compressedFile = await compressImage(newFile);
          setImageFile(compressedFile);
          setImagePreview(URL.createObjectURL(compressedFile));
          stopWebCamera(); // Stop camera after capture
          setActiveTab("preview"); // Switch to preview/save tab for web
        } catch (err: any) {
          setError(`Error processing web image: ${err.message}`);
        }
      }, 'image/jpeg', 0.9);
    } catch (err: any) {
      console.error("Error capturing web photo:", err);
      setError(`Failed to capture web photo: ${err.message}`);
    }
  };

  // --- Shared Logic ---
  const compressImage = async (file: File): Promise<File> => {
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1000,
        useWebWorker: true,
        initialQuality: 0.9,
      };
      return await imageCompression(file, options);
    } catch (err) {
      console.error("Image compression failed:", err);
      // Don't show error toast here, just return original
      return file;
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file");
        return;
      }
      try {
        setError(null);
        const compressedFile = await compressImage(file);
        setImageFile(compressedFile);
        setImagePreview(URL.createObjectURL(compressedFile));
        setActiveTab("preview"); // Switch to preview tab
      } catch (err: any) {
        console.error("Error processing file:", err);
        setError("Error processing file. Please try again.");
      }
    }
  };

  const handleDelete = async () => {
    if (!currentAvatar) return;
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Get the path from the URL
      const urlParts = currentAvatar.split('/');
      // Check if it's a Supabase storage URL
      const isSupabaseUrl = urlParts.some(part => part === 'storage' || part === 'avatars');
      
      if (isSupabaseUrl) {
        // Extract the path from the URL
        // Typically in format: https://xxx.supabase.co/storage/v1/object/public/avatars/userId/filename
        const pathIndex = urlParts.findIndex(part => part === 'avatars');
        if (pathIndex !== -1) {
          const avatarPath = urlParts.slice(pathIndex).join('/');
          
          // Delete the file from storage
          const { error: deleteError } = await supabase.storage
            .from('avatars')
            .remove([avatarPath]);
          
          if (deleteError) {
            console.error("Storage delete error:", deleteError);
            // Continue anyway to update the database
          }
        }
      }
      
      // Try to determine the correct column name in the users table
      try {
        // First try with avatar_url
        let updateError = (await supabase
          .from('users')
          .update({ avatar_url: null })
          .eq('id', userId)).error;
        
        if (updateError) {
          console.log("Error updating with avatar_url, trying alternative field names:", updateError);
          
          // If that fails, try alternative column names
          const possibleFields = ['avatarUrl', 'avatar', 'profile_picture', 'profilePicture', 'photo'];
          let updated = false;
          
          for (const field of possibleFields) {
            const updateData = { [field]: null };
            const { error } = await supabase
              .from('users')
              .update(updateData)
              .eq('id', userId);
            
            if (!error) {
              console.log(`Successfully removed avatar using field: ${field}`);
              updated = true;
              break;
            }
          }
          
          if (!updated) {
            console.error("Could not update any known avatar field in user profile");
            throw new Error("Failed to update database with avatar removal");
          }
        }
      } catch (err: any) {
        console.error("Avatar column update error:", err);
        throw err;
      }
      
      // Update UI
      setImagePreview(null);
      setImageFile(null);
      onAvatarUpdate(null);
      
      toast({
        title: "Avatar Removed",
        description: "Your profile picture has been removed.",
        duration: 3000,
      });
      
      onClose();
    } catch (err: any) {
      console.error("Error deleting avatar:", err);
      setError(err.message || "Failed to remove profile picture. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Modified handleSubmit to accept optional file argument (for native camera flow)
  const handleSubmit = async (fileToSubmit: File | null = imageFile) => {
    if (!fileToSubmit) {
      setError("No image selected or captured to save.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Upload the image to Supabase Storage
      const filePath = `avatars/${userId}/${Date.now()}.jpg`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, fileToSubmit, {
          upsert: true,
          contentType: 'image/jpeg'
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get the public URL for the uploaded image
      const { data: urlData } = await supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      if (!urlData?.publicUrl) {
        throw new Error("Failed to get URL for uploaded image");
      }

      // Try to determine the correct column name in the users table
      try {
        // First, try with avatar_url
        const { error: updateError } = await supabase
          .from('users')
          .update({ avatar_url: urlData.publicUrl })
          .eq('id', userId);

        if (updateError) {
          console.error("Error updating with avatar_url, trying alternative field names:", updateError);

          // If that fails, try alternative column names
          const possibleFields = ['avatarUrl', 'avatar', 'profile_picture', 'profilePicture', 'photo'];
          let updated = false;

          for (const field of possibleFields) {
            const updateData = { [field]: urlData.publicUrl };
            const { error } = await supabase
              .from('users')
              .update(updateData)
              .eq('id', userId);

            if (!error) {
              console.log(`Successfully updated avatar using field: ${field}`);
              updated = true;
              break;
            }
          }

          if (!updated) {
              // If still failing, log but don't block UI update
             console.error("Could not update user profile with avatar URL after trying multiple fields.");
             toast({
                title: "Profile Updated (DB Error)",
                description: "Avatar uploaded, but failed to link to profile. Contact support.",
                variant: "destructive",
                duration: 5000,
            });
             // Proceed to update UI anyway
          }
        }
      } catch (err: any) {
        console.error("Avatar column update error:", err);
         toast({
            title: "Profile Update Issue",
            description: "Avatar uploaded, but there was a database issue. Contact support.",
            variant: "destructive",
            duration: 5000,
        });
         // Proceed to update UI anyway
      }

      // Success
      toast({
        title: "Profile Picture Updated",
        description: "Your avatar has been successfully updated.",
        duration: 3000,
      });

      // Update parent component
      onAvatarUpdate(urlData.publicUrl);
      setImageFile(null); // Clear file state after successful upload

      // Close dialog
      onClose();
    } catch (err: any) {
      console.error("Error updating avatar:", err);
      setError(err.message || "Failed to update profile picture. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open && !isSubmitting) {
          if (!isNative) stopWebCamera(); // Only stop web camera
          onClose();
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Update Profile Picture</DialogTitle>
            <DialogDescription>
              Upload a new profile picture or take one {isNative ? "using the camera" : "with your webcam"}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex justify-center py-4">
            <Avatar className="h-32 w-32">
              {imagePreview ? (
                <AvatarImage src={imagePreview} alt="Preview" />
              ) : (
                <AvatarFallback className="text-2xl text-white bg-[#228B22]">
                  {getInitials(userName)}
                </AvatarFallback>
              )}
            </Avatar>
          </div>
          
          <Tabs value={activeTab} onValueChange={(value) => {
             setActiveTab(value);
             setError(null); // Clear error on tab change
             if (!isNative && value === "camera") {
                startWebCamera();
             } else {
                stopWebCamera(); // Stop web camera if switching away or on native
             }
             // Reset image preview if switching back to upload/camera from a preview state
             if (value === "upload" || value === "camera") {
                 if(imageFile) { // If there was a file selected/captured
                    setImageFile(null);
                    setImagePreview(currentAvatar || null); // Reset to original or fallback
                 }
             }
          }} className="w-full">
            <TabsList className={`grid w-full ${currentAvatar ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {hasCameraSupportState && (
                <TabsTrigger value="camera" disabled={isSubmitting}>
                  <CameraIconLucide className="h-4 w-4 mr-2" />
                  Camera
                </TabsTrigger>
              )}
              <TabsTrigger value="upload" disabled={isSubmitting}>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </TabsTrigger>
              {currentAvatar && (
                <TabsTrigger value="remove" disabled={isSubmitting}>
                  <Trash className="h-4 w-4 mr-2" />
                  Remove
                </TabsTrigger>
              )}
            </TabsList>

            {hasCameraSupportState && (
              <TabsContent value="camera" className="mt-4">
                {isNative ? (
                  // Native Camera Button
                  <Button
                    onClick={takeNativePhoto}
                    className="w-full bg-[#228B22] hover:bg-[#1a6b1a]"
                    disabled={isSubmitting}
                  >
                     {isSubmitting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                     ) : (
                        <CameraIconLucide className="h-4 w-4 mr-2" />
                     )}
                    Open Camera
                  </Button>
                ) : (
                  // Web Camera View & Capture
                  <>
                    <div className="relative rounded-md overflow-hidden border bg-gray-200 min-h-[200px]">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-auto"
                        style={{ maxHeight: "260px" }}
                        />
                        {!cameraStream && <div className="absolute inset-0 flex items-center justify-center text-gray-500">Starting webcam...</div>}
                    </div>
                    <Button
                      onClick={captureWebPhoto}
                      className="w-full mt-4 bg-[#228B22] hover:bg-[#1a6b1a]"
                      disabled={!cameraStream || isSubmitting}
                    >
                      <CameraIconLucide className="h-4 w-4 mr-2" />
                      Capture Photo
                    </Button>
                  </>
                )}
              </TabsContent>
            )}
            
            <TabsContent value="upload" className="mt-4">
              <div className="flex justify-center">
                <div>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={isSubmitting}
                  />
                  <Label 
                    htmlFor="avatar-upload" 
                    className="cursor-pointer flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-[#228B22] text-white hover:bg-[#1a6b1a]"
                  >
                    <Upload className="h-4 w-4" />
                    Choose Image
                  </Label>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="remove" className="mt-4">
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to remove your profile picture? This action cannot be undone.
                </p>
                <Button 
                  onClick={handleDelete} 
                  className="bg-red-500 hover:bg-red-600 text-white"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <Trash className="h-4 w-4 mr-2" />
                      Remove Profile Picture
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
          
          {error && (
            <div className="text-sm text-red-500 flex items-center mt-4">
              <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
              {error}
            </div>
          )}
          
          <DialogFooter className="mt-6">
            <Button 
              variant="outline" 
              onClick={() => {
                 if (!isNative) stopWebCamera();
                 onClose();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            {activeTab !== "remove" && imageFile && (
              <Button 
                onClick={() => handleSubmit()}
                disabled={isSubmitting || !imageFile}
                className="bg-[#228B22] hover:bg-[#1a6b1a]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Save Profile Picture"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AvatarUploadPopup; 