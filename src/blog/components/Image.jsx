import { IKImage } from "imagekitio-react";

// Thin wrapper over ImageKit's <IKImage>: lazy-loaded, low-quality placeholder
// while the real file arrives, resized to the requested box.
//
// `src` here takes two shapes. Post cover images are ImageKit paths — the
// relative filePath the client-side upload hands back — while avatars come from
// Clerk and are fully-qualified img.clerk.com URLs. IKImage builds the two
// differently: `path` is joined onto our urlEndpoint, whereas `src` is taken
// as-is with the transformation appended as a query param. Passing an absolute
// URL as `path` would glue our endpoint onto the front of it and produce a dead
// address, so route each input to the prop that matches it.
const Image = ({ src, className, w, h, alt }) => {
  const isAbsoluteUrl = /^https?:\/\//i.test(src || "");

  return (
    <IKImage
      urlEndpoint={import.meta.env.VITE_IK_URL_ENDPOINT}
      path={isAbsoluteUrl ? undefined : src}
      src={isAbsoluteUrl ? src : undefined}
      className={className}
      loading="lazy"
      lqip={{ active: true, quality: 20 }}
      alt={alt}
      width={w}
      height={h}
      transformation={[
        {
          width: w,
          height: h,
        },
      ]}
    />
  );
};

export default Image;
