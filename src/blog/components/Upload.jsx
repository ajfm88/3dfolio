import { IKContext, IKUpload } from "imagekitio-react";
import { useRef } from "react";
import { toast } from "react-toastify";
import { api } from "../lib/axios";

// upload-auth is admin-gated (protectRoute + requireAdmin), unlike the
// reference's plain fetch — go through the shared `api` instance so the
// Clerk bearer token interceptor attaches, or every request 401s.
const authenticator = async () => {
  try {
    const res = await api.get("/posts/upload-auth");
    const { signature, expire, token } = res.data;
    return { signature, expire, token };
  } catch (error) {
    throw new Error(`Authentication request failed: ${error.message}`);
  }
};

const Upload = ({ children, type, setProgress, setData }) => {
  const ref = useRef(null);

  const onError = (err) => {
    console.log(err);
    toast.error("Image upload failed!");
  };
  const onSuccess = (res) => {
    console.log(res);
    setData(res);
  };
  const onUploadProgress = (progress) => {
    console.log(progress);
    setProgress(Math.round((progress.loaded / progress.total) * 100));
  };

  return (
    <IKContext
      publicKey={import.meta.env.VITE_IK_PUBLIC_KEY}
      urlEndpoint={import.meta.env.VITE_IK_URL_ENDPOINT}
      authenticator={authenticator}
    >
      <IKUpload
        useUniqueFileName
        onError={onError}
        onSuccess={onSuccess}
        onUploadProgress={onUploadProgress}
        className="hidden"
        ref={ref}
        accept={`${type}/*`}
      />
      <div className="cursor-pointer" onClick={() => ref.current.click()}>
        {children}
      </div>
    </IKContext>
  );
};

export default Upload;
