import { useRef, useState } from "react";
import { motion } from "framer-motion";

import { styles } from "../styles";
import { EarthCanvas } from "./canvas";
import { SectionWrapper } from "../hoc";
import { slideIn } from "../utils/motion";

const Contact = () => {
  const formRef = useRef();
  const [form, setForm] = useState({
    name: "",
    email: "",
    message: "",
  });

  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({
    show: false,
    type: "",
    message: "",
  });

  const handleChange = (e) => {
    const { target } = e;
    const { name, value } = target;

    setForm({
      ...form,
      [name]: value,
    });

    if (notification.show && notification.type === "error") {
      setNotification({ show: false, type: "", message: "" });
    }
  };

  const checkValidation = () => {
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      return false;
    }

    if (!/\S+@\S+\.\S+/.test(form.email)) {
      setNotification({
        show: true,
        type: "error",
        message: "Please enter a valid email address.",
      });
      return false;
    }

    return true;
  };

  const handleSubmit = (e) => {
    if (!checkValidation()) {
      if (!/\S+@\S+\.\S+/.test(form.email) && form.email.trim()) {
        e.preventDefault();
      }
      return;
    }

    e.preventDefault();

    setLoading(true);
    setNotification({ show: false, type: "", message: "" });

    const formData = new FormData(formRef.current);

    fetch(import.meta.env.VITE_APP_GETFORM_DOT_IO_ENDPOINT, {
      method: "POST",
      body: formData,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Form submission failed");
        }
        setForm({
          name: "",
          email: "",
          message: "",
        });
        setNotification({
          show: true,
          type: "success",
          message: "Thank you. I will get back to you as soon as possible.",
        });
        setTimeout(() => {
          setNotification({ show: false, type: "", message: "" });
        }, 3000);
      })
      .catch((error) => {
        console.error(error);
        setNotification({
          show: true,
          type: "error",
          message: "Something went wrong. Please try again.",
        });
        setTimeout(() => {
          setNotification({ show: false, type: "", message: "" });
        }, 3000);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <div
      className={`xl:mt-12 flex xl:flex-row flex-col-reverse gap-10 overflow-hidden`}
    >
      <motion.div
        variants={slideIn("left", "tween", 0.2, 1)}
        className="flex-[0.75] bg-black-100 p-8 rounded-2xl relative"
      >
        <p className={styles.sectionSubText}>Get in touch</p>
        <h3 className={styles.sectionHeadText}>Contact Me</h3>

        <div className="mt-4 flex gap-4">
          <a
            href="https://github.com/ajfm88"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-[#915EFF] transition-colors duration-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </a>
          <a
            href="https://linkedin.com/in/ajfm88"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-[#915EFF] transition-colors duration-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
            </svg>
          </a>
          <a
            href="https://linktr.ee/ajfm88"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-[#915EFF] transition-colors duration-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M13.736 10.249l4.09-4.09-1.414-1.414-4.09 4.09V2h-2v6.835l-4.09-4.09-1.414 1.414 4.09 4.09H2v2h6.908l-4.09 4.09 1.414 1.414L10.322 13.9V22h2v-8.1l4.09 4.09 1.414-1.414-4.09-4.09H22v-2h-8.264z" />
            </svg>
          </a>
        </div>

        <div className="h-12 relative">
          {notification.show && (
            <div
              className={`absolute inset-0 px-4 py-3 rounded-lg transition-opacity duration-300 ${
                notification.type === "success"
                  ? "bg-green-600 text-white"
                  : "bg-red-600 text-white"
              }`}
            >
              {notification.message}
            </div>
          )}
        </div>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="mt-4 flex flex-col gap-8"
        >
          <label className="flex flex-col">
            <span className="text-white font-medium mb-4">Your Name</span>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="What’s a good name for you?"
              className="bg-tertiary py-4 px-6 placeholder:text-secondary text-white rounded-lg outline-none border-none font-medium"
              required
            />
          </label>
          <label className="flex flex-col">
            <span className="text-white font-medium mb-4">Your email</span>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="What’s your email address?"
              className="bg-tertiary py-4 px-6 placeholder:text-secondary text-white rounded-lg outline-none border-none font-medium"
              required
            />
          </label>
          <label className="flex flex-col">
            <span className="text-white font-medium mb-4">Your Message</span>
            <textarea
              rows={7}
              name="message"
              value={form.message}
              onChange={handleChange}
              placeholder="What would you like to say?"
              className="bg-tertiary py-4 px-6 placeholder:text-secondary text-white rounded-lg outline-none border-none font-medium"
              required
            />
          </label>

          <button
            type="submit"
            className="bg-tertiary py-3 px-8 rounded-xl outline-none w-fit text-white font-bold shadow-md shadow-primary"
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </form>
      </motion.div>

      <motion.div
        variants={slideIn("right", "tween", 0.2, 1)}
        className="xl:flex-1 xl:h-auto md:h-[550px] h-[350px]"
      >
        <EarthCanvas />
      </motion.div>
    </div>
  );
};

export default SectionWrapper(Contact, "contact");
