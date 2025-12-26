export type Theater = {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    tags?: string[];
    brand?: "CGV" | "롯데시네마" | "메가박스" | "기타";
    region?: "서울" | "경기" | "충청" | "전라" | "강원" | "경상" | "기타";
};