/* eslint-disable react/jsx-max-props-per-line */
import React, { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Helmet } from "react-helmet-async";
import { Box, IconButton, Paper, Typography } from "@mui/material";
import TextareaAutosize from "@mui/material/TextareaAutosize";
import SendIcon from "@mui/icons-material/Send";

/**
 * Chat page – fixes:
 *  • Message pane now scrolls when content exceeds height.
 *  • Composer floats bottom‑centre.
 *  • Bubbles wrap long words and align left/right (75 % width cap).
 */

const Talker: React.FC = () => {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  const sendMessage = () => {
    const txt = input.trim();
    if (!txt) return;
    setMessages(prev => [...prev, { role: "user", content: txt }]);
    setInput("");

    setTimeout(() => {
      setMessages(prev => [...prev, { role: "assistant", content: `Echo: ${txt}` }]);
    }, 300);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Auto‑scroll to bottom when messages change
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <>
      <Helmet>
        <title>VAIS Console</title>
      </Helmet>

      <Box
        sx={{
          height: "91.5vh", // leave room for header
          bgcolor: "#131314",
          color: "#E3E3E3",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {/* Scrollable Messages */}
        <Box
          ref={listRef}
          sx={{
            flex: 1,
            width: "100%",
            px: 3,
            pt: 6,
            pb: 12, // keep space for composer
            overflowY: "auto"
          }}
        >
          {messages.length === 0 ? (
            <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Typography color="#8E8E93">How can I help you today?</Typography>
            </Box>
          ) : (
            messages.map((m, i) => (
              <Box key={i} sx={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", mb: 1.5 }}>
                <Paper
                  elevation={3}
                  sx={{
                    px: 2,
                    py: 1.25,
                    maxWidth: "75%",
                    bgcolor: m.role === "user" ? "#3E3F4B" : "#202123",
                    color: "#E3E3E3",
                    borderTopRightRadius: m.role === "user" ? 0 : 2,
                    borderTopLeftRadius: m.role === "assistant" ? 0 : 2,
                    borderBottomRightRadius: 2,
                    borderBottomLeftRadius: 2,
                    fontSize: 14,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    overflowWrap: "anywhere"
                  }}
                >
                  {m.content}
                </Paper>
              </Box>
            ))
          )}
        </Box>

        {/* Floating Composer */}
        <Box
          sx={{
            position: "absolute",
            bottom: 24,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            px: 2
          }}
        >
          <Box
            sx={{
              width: "100%",
              maxWidth: 900,
              display: "flex",
              alignItems: "flex-end",
              gap: 1.5,
              bgcolor: "#202123",
              borderRadius: 2,
              px: 2,
              py: 1
            }}
          >
            <TextareaAutosize
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              minRows={1}
              style={{
                flexGrow: 1,
                resize: "none",
                background: "transparent",
                border: 0,
                outline: "none",
                color: "#fff",
                fontSize: 14,
                lineHeight: 1.4,
                fontFamily: "inherit"
              }}
              placeholder="Send a message..."
            />

            <IconButton
              onClick={sendMessage}
              disabled={!input.trim()}
              sx={{ bgcolor: "#343541", width: 28, height: 28, "&:disabled": { opacity: 0.4 } }}
            >
              <SendIcon sx={{ color: "#fff" }} />
            </IconButton>
          </Box>
        </Box>
      </Box>
    </>
  );
};

export default Talker;