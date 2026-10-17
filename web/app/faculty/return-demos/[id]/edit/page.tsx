import type { Metadata } from "next";
import ReturnDemoForm from "../../return-demo-form";

export const metadata: Metadata = {
  title: "Edit Return Demonstration | iCARE++",
};

export default async function EditReturnDemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReturnDemoForm id={id} />;
}
