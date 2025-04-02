import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, CheckCircle, AlertCircle, Info, Camera as CameraIconLucide, Image as ImageIcon, MapPin } from "lucide-react";
import { supabase, checkStorageBucket } from "@/lib/supabaseClient";
import imageCompression from "browser-image-compression";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource, PermissionStatus } from '@capacitor/camera';
import { BackgroundTask } from '@capawesome/capacitor-background-task';

interface MeterReadingPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reading: number, imageUrl: string | null, location?: { latitude: number, longitude: number }) => Promise<void>;
  type: "check-in" | "check-out";
  userId: string;
}

// Helper to convert Data URL to Blob (same as in AvatarUploadPopup)
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

const MeterReadingPopup: React.FC<MeterReadingPopupProps> = ({
  isOpen,
  onClose,
  onSubmit,
  type,
  userId,
}) => {
  const [meterReading, setMeterReading] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compressionStatus, setCompressionStatus] = useState<string | null>(null);
  const [submissionStage, setSubmissionStage] = useState<string | null>(null);
  const [bucketStatus, setBucketStatus] = useState<{ exists: boolean; checked: boolean }>({ exists: false, checked: false });
  const [activeTab, setActiveTab] = useState<string>("upload");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shareLocation, setShareLocation] = useState<boolean>(true);
  const [hasCheckedCameraSupport, setHasCheckedCameraSupport] = useState(false);
  const [hasCameraSupportState, setHasCameraSupportState] = useState(false);

  const geolocation = useGeolocation();
  const isNative = Capacitor.isNativePlatform();

  // --- Initialization and Camera Support ---
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

  useEffect(() => {
    if (isOpen) {
      checkBucketExists();
      checkCameraSupport();
      // Reset state on open
      setMeterReading("");
      setImageFile(null);
      setImagePreview(null);
      setError(null);
      setCompressionStatus(null);
      setSubmissionStage(null);
      setIsSubmitting(false);
      setActiveTab("upload");
      setShareLocation(true); // Default to sharing location
    } else {
       // Ensure web camera is stopped if dialog closes
       if (!isNative) stopWebCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Check bucket status
  const checkBucketExists = async () => {
    try {
      const result = await checkStorageBucket('meter-readings');
      console.log("[DEBUG] Bucket check result:", result);
      setBucketStatus({ exists: result.exists, checked: true });
      
      if (!result.exists) {
        console.log("[DEBUG] Bucket does not exist, setting error");
        setError(result.error || "Storage configuration issue. Please contact support. You can still submit readings without images.");
      } else {
        console.log("[DEBUG] Bucket exists or is assumed to exist");
      }
    } catch (err: any) {
      console.error("[DEBUG] Error checking storage bucket:", err);
      setBucketStatus({ exists: true, checked: true }); // Assume bucket exists on error
      setError("Storage check failed. You can still submit readings without images.");
    }
  };

  // --- Native Camera Logic ---
   const takeNativePhoto = async () => {
        if (!hasCameraSupportState) {
            setError("Camera is not supported on this device.");
            return;
        }
        setError(null);
        setCompressionStatus(null);
        setIsSubmitting(true); // Indicate activity

        try {
            let permissionStatus: PermissionStatus = await Camera.checkPermissions();
            if (permissionStatus.camera !== 'granted') {
                permissionStatus = await Camera.requestPermissions({ permissions: ['camera'] });
            }
            if (permissionStatus.camera !== 'granted') {
                throw new Error("Camera permission denied.");
            }

            const image = await Camera.getPhoto({
                quality: 85,
                allowEditing: false, // Meter readings likely don't need editing
                resultType: CameraResultType.DataUrl,
                source: CameraSource.Camera,
                saveToGallery: false
            });

            if (image.dataUrl) {
                const blob = dataURLtoBlob(image.dataUrl);
                if (!blob) throw new Error("Could not convert photo data to Blob.");

                const timestamp = new Date().getTime();
                const newFile = new File([blob], `meter-${type}-${timestamp}.jpg`, { type: 'image/jpeg' });

                const compressedFile = await compressImage(newFile);
                setImageFile(compressedFile);
                setImagePreview(URL.createObjectURL(compressedFile));
                setActiveTab("preview"); // Go to preview/submit stage
            } else {
                throw new Error("Failed to get photo data.");
            }
        } catch (err: any) {
            console.error("Error taking native photo:", err);
            if (err.message?.toLowerCase().includes('cancelled')) {
                setError(null); // User cancelled, not an error
            } else if (err.message?.toLowerCase().includes('permission')) {
                 setError("Camera permission denied. Please grant access in settings.");
            } else {
                 setError(`Error taking photo: ${err.message || "Unknown error"}`);
            }
            setActiveTab("upload"); // Go back if error or cancelled
        } finally {
            setIsSubmitting(false);
        }
    };

  // --- Web Camera Logic (Fallback) ---
  const stopWebCamera = () => {
      if (isNative) return; // Only run on web
      try {
        if (cameraStream) {
          cameraStream.getTracks().forEach(track => {
            try {
              track.stop();
            } catch (err) {
              console.error("Error stopping camera track:", err);
            }
          });
          setCameraStream(null);

          if (videoRef.current) {
            videoRef.current.srcObject = null;
            videoRef.current.load(); // Force cleanup
          }
        }
      } catch (err) {
        console.error("Error in stopWebCamera:", err);
      }
    };

  const startWebCamera = async () => {
      if (isNative) return;
      try {
        stopWebCamera();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
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
      if (isNative || !videoRef.current || !cameraStream) return;
      try {
        const canvas = document.createElement('canvas');
        const video = videoRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (!blob) throw new Error("Failed to capture web image.");
          const timestamp = new Date().getTime();
          const newFile = new File([blob], `meter-${type}-${timestamp}.jpg`, { type: 'image/jpeg' });
          const compressedFile = await compressImage(newFile);
          setImageFile(compressedFile);
          setImagePreview(URL.createObjectURL(compressedFile));
          setActiveTab("preview");
          stopWebCamera(); // Stop after capture
        }, 'image/jpeg', 0.8);
      } catch (err: any) {
        console.error("Error capturing web photo:", err);
        setError(`Failed to capture web photo: ${err.message}`);
      }
    };

  // --- Shared Logic ---
  const compressImage = async (file: File): Promise<File> => {
      setCompressionStatus("Compressing image...");
      try {
        const options = {
          maxSizeMB: 2,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          initialQuality: 0.8,
        };
        const compressedFile = await imageCompression(file, options);
        const ratio = ((file.size - compressedFile.size) / file.size * 100).toFixed(1);
        if (file.size > compressedFile.size) {
          setCompressionStatus(`Compressed by ${ratio}% (${(compressedFile.size / (1024 * 1024)).toFixed(2)} MB)`);
        } else {
          setCompressionStatus("Image already optimized");
        }
        return compressedFile;
      } catch (err) {
        console.error("Image compression failed:", err);
        setError("Image compression failed. Uploading original image.");
        setCompressionStatus(null);
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
            setCompressionStatus(null);
            const compressedFile = await compressImage(file);
            setImageFile(compressedFile);
            setImagePreview(URL.createObjectURL(compressedFile));
            setActiveTab("preview"); // Go to preview after selecting
        } catch (err: any) {
            console.error("Error processing file:", err);
            setError("Error processing file. Please try again.");
        }
      }
    };

  // --- Submission Logic with BackgroundTask --- 
  const handleSubmit = async (e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    setError(null);
    setSubmissionStage(null);

    // Validation
    const readingValue = parseFloat(meterReading);
    if (isNaN(readingValue) || readingValue < 0) {
      setError("Please enter a valid, non-negative meter reading.");
      return;
    }
    if (shareLocation && geolocation.error) {
        setError(`Cannot submit with location: ${geolocation.error}`);
        // Optionally allow submission without location?
        // setShareLocation(false); 
        // Or return
        return; 
    }
    if (shareLocation && !geolocation.latitude) {
        setError("Getting location... please wait or disable location sharing.");
        return;
    }
    if (!imageFile) {
      setError("Please upload or capture an image of the meter.");
      return; // Require image for meter readings
    }

    setIsSubmitting(true);

    const uploadAndSubmitLogic = async () => {
      let imageUrl: string | null = null;
      try {
        // 1. Upload Image if present
        if (imageFile && bucketStatus.exists) {
          setSubmissionStage("Uploading image...");
          const filePath = `meter-readings/${userId}/${type}-${Date.now()}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from('meter-readings')
            .upload(filePath, imageFile, {
              upsert: false,
              contentType: 'image/jpeg'
            });

          if (uploadError) {
            throw new Error(`Image upload failed: ${uploadError.message}`);
          }

          const { data: urlData } = supabase.storage
            .from('meter-readings')
            .getPublicUrl(filePath);
          imageUrl = urlData?.publicUrl || null;
           if (!imageUrl) console.warn("Could not get public URL after meter image upload.");
        } else if (imageFile && !bucketStatus.exists) {
             console.warn("Bucket not confirmed to exist, skipping image upload.");
        }

        // 2. Prepare Location Data
        const locationData = shareLocation && geolocation.latitude && geolocation.longitude
           ? { latitude: geolocation.latitude, longitude: geolocation.longitude }
           : undefined;

        // 3. Call onSubmit Prop
        setSubmissionStage("Submitting reading...");
        await onSubmit(readingValue, imageUrl, locationData);

        setSubmissionStage("Submission successful!");
        // Optionally close after a short delay
        setTimeout(() => {
          onClose();
        }, 1500);

      } catch (err: any) {
        console.error("Submission process failed:", err);
        setError(err.message || "An unexpected error occurred during submission.");
        setSubmissionStage(null);
      } finally {
        setIsSubmitting(false);
         // BackgroundTask.finish called outside this block
      }
    };

     // Execute the logic, wrapping in BackgroundTask if native
    if (isNative) {
        let taskId: string | undefined;
        try {
            taskId = await BackgroundTask.beforeExit(async () => {
                console.log('Background task started for meter reading submission...');
                await uploadAndSubmitLogic();
                console.log('Background task finished for meter reading submission.');
                if (taskId) {
                    BackgroundTask.finish({ taskId });
                }
            });
        } catch (err) {
            console.error('Failed to start background task for submission:', err);
            setError('Failed to register background task. Submitting normally...');
            await uploadAndSubmitLogic(); // Attempt foreground submission as fallback
            if(isSubmitting) setIsSubmitting(false); // Reset if foreground fails instantly
        }
    } else {
        // Run directly if not native
        await uploadAndSubmitLogic();
    }
  };

  // --- Render Logic ---
  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
       if (!open && !isSubmitting) {
            if (!isNative) stopWebCamera();
            onClose();
       }
    }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="capitalize">{type} Reading</DialogTitle>
          <DialogDescription>
Please enter the current meter reading and capture or upload a clear photo of the meter display.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
           {/* Meter Reading Input */} 
          <div className="space-y-1">
            <Label htmlFor="meter-reading">Meter Reading</Label>
            <Input
              id="meter-reading"
              type="number"
              placeholder="Enter reading"
              value={meterReading}
              onChange={(e) => setMeterReading(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          {/* Image Input Tabs */} 
          <div className="space-y-1">
            <Label>Meter Photo</Label>
            <Tabs value={activeTab} onValueChange={(value) => {
                 setActiveTab(value);
                 setError(null);
                 setCompressionStatus(null);
                 if (value === "camera" && !isNative) {
                    startWebCamera();
                 } else {
                    stopWebCamera();
                 }
                 // Reset image preview if switching back to upload/camera from a preview state
                 if (value === "upload" || value === "camera") {
                     if(imageFile) {
                        setImageFile(null);
                        setImagePreview(null);
                     }
                 }
            }} className="w-full">
                <TabsList className={`grid w-full ${hasCameraSupportState ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {hasCameraSupportState && (
                    <TabsTrigger value="camera" disabled={isSubmitting}>
                       <CameraIconLucide className="h-4 w-4 mr-2" /> Camera
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="upload" disabled={isSubmitting}>
                     <Upload className="h-4 w-4 mr-2" /> Upload
                  </TabsTrigger>
                  {/* Simple Preview Tab */} 
                  <TabsTrigger value="preview" disabled={!imagePreview || isSubmitting}>
                     <ImageIcon className="h-4 w-4 mr-2" /> Preview
                  </TabsTrigger>
                </TabsList>

                 {/* Camera Tab */} 
                 {hasCameraSupportState && (
                     <TabsContent value="camera" className="mt-4 border rounded-md p-4 min-h-[200px] flex items-center justify-center">
                        {isNative ? (
                             <Button onClick={takeNativePhoto} disabled={isSubmitting} className="w-full">
                                 <CameraIconLucide className="h-4 w-4 mr-2" /> Open Camera
                             </Button>
                        ) : (
                             <div className="w-full flex flex-col items-center space-y-4">
                                <div className="relative rounded-md overflow-hidden border bg-gray-200 w-full aspect-video">
                                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                                    {!cameraStream && <div className="absolute inset-0 flex items-center justify-center text-gray-500">Starting webcam...</div>}
                                </div>
                                <Button onClick={captureWebPhoto} disabled={!cameraStream || isSubmitting} className="w-1/2">
                                    <CameraIconLucide className="h-4 w-4 mr-2" /> Capture
                                </Button>
                             </div>
                        )}
                     </TabsContent>
                 )}

                 {/* Upload Tab */} 
                 <TabsContent value="upload" className="mt-4 border rounded-md p-4 min-h-[200px] flex items-center justify-center">
                    <div className="text-center">
                        <input
                            id="meter-photo-upload"
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                            disabled={isSubmitting}
                        />
                        <Label htmlFor="meter-photo-upload" className="cursor-pointer inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-[#228B22] text-white hover:bg-[#1a6b1a]">
                            <Upload className="h-5 w-5" /> Choose Image
                        </Label>
                        <p className="text-xs text-muted-foreground mt-2">Select a photo of the meter</p>
                    </div>
                 </TabsContent>

                 {/* Preview Tab */} 
                <TabsContent value="preview" className="mt-4 border rounded-md p-4 min-h-[200px] flex flex-col items-center justify-center">
                    {imagePreview ? (
                        <img src={imagePreview} alt="Meter preview" className="max-h-48 max-w-full rounded-md object-contain mb-2" />
                    ) : (
                        <p className="text-muted-foreground">No image selected or captured yet.</p>
                    )}
                    {compressionStatus && <p className="text-xs text-muted-foreground mt-1">{compressionStatus}</p>}
                </TabsContent>
            </Tabs>

             {/* Bucket Status Info */}
             {!bucketStatus.checked && <p className="text-xs text-muted-foreground flex items-center"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Checking storage setup...</p>}
             {bucketStatus.checked && !bucketStatus.exists && <p className="text-xs text-orange-600 flex items-center"><AlertCircle className="h-3 w-3 mr-1" /> Image upload disabled (storage issue).</p>}

          </div>

          {/* Location Sharing */} 
          <div className="flex items-center space-x-2 mt-4">
              <Switch 
                  id="share-location" 
                  checked={shareLocation}
                  onCheckedChange={setShareLocation}
                  disabled={isSubmitting || geolocation.loading} 
              />
              <Label htmlFor="share-location" className="flex items-center">
                  <MapPin className="h-4 w-4 mr-1 text-gray-500"/> Share Location
              </Label>
              {geolocation.loading && <Loader2 className="h-3 w-3 ml-1 animate-spin" />}
              {shareLocation && geolocation.error && <span className="text-xs text-red-500 ml-2">({geolocation.error})</span>}
          </div>

           {/* Error Display */} 
          {error && (
            <div className="text-sm text-red-500 flex items-center mt-2">
              <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" /> {error}
            </div>
          )}

          {/* Submission Status */} 
          {submissionStage && (
            <div className={`text-sm flex items-center mt-2 ${submissionStage.includes("successful") ? 'text-green-600' : 'text-blue-600'}`}>
              {submissionStage.includes("successful") ? <CheckCircle className="h-4 w-4 mr-1" /> : <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {submissionStage}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !meterReading || !imageFile || (shareLocation && geolocation.loading)}> 
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit Reading
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MeterReadingPopup; 