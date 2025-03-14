import React, { useRef, useState } from "react";
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
