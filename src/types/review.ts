export type Review = {
    id: string; // uid
    userId: string;
    displayName: string;
    screen: number;
    picture: number;
    sound: number;
    seat: number;
    comment: string;
    likeCount: number;
};

export type ReviewForm = {
    screen: number;
    picture: number;
    sound: number;
    seat: number;
    comment: string;
};

export type SortMode = "latest" | "likes";