import type { Metadata } from "next";
import ReturnDemoForm from "../return-demo-form";

export const metadata: Metadata = {
  title: "New Return Demonstration | iCARE++",
};

export default function NewReturnDemoPage() {
  return <ReturnDemoForm />;
}
