// Placeholder — reading a post by slug + comments land in slice 13/15.
import { useParams } from "react-router-dom";

const SinglePostPage = () => {
  const { slug } = useParams();
  return <div className="py-24 text-center text-gray-500">Post &quot;{slug}&quot; — coming in a later slice.</div>;
};

export default SinglePostPage;
